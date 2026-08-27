import assert from "node:assert/strict";
import test from "node:test";

import type { JdReader, JdRecord } from "../src/api/types.js";
import type { LocalResumeDraft } from "../src/resume/draft/types.js";
import { allEvidenceCandidates } from "../src/resume/quality/evidence-candidates.js";
import { findResumeReuseCandidates } from "../src/resume/reuse/candidate-retrieval.js";
import type { ResumePublicationGateway } from "../src/resume/save/types.js";
import { buildResumeSkeleton } from "../src/resume/workspace/candidate-skeleton.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createResumeWorkspaceTool } from "../src/tools/agent-orchestrated/create-workspace.js";
import { createResumeReadTools } from "../src/tools/resume-tools.js";
import { cloudResumeFixture } from "./support/cloud-resume-fixture.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("reuse retrieval narrows candidates without making the Agent decision", async () => {
  const target = jd("jd-new", "后端工程师", ["TypeScript", "Node.js"]);
  const sameRole = jd("jd-same", "后端工程师", ["TypeScript"]);
  const keywordHeavy = jd("jd-overlap", "平台工程师", ["TypeScript", "Node.js"]);
  const unrelated = jd("jd-other", "设计师", ["Figma"]);
  const jds = jdReader([target, sameRole, keywordHeavy, unrelated]);
  const resumes = resumeReader([
    resume("resume-same", "jd-same", "2026-08-01T00:00:00Z"),
    resume("resume-overlap", "jd-overlap", "2026-08-20T00:00:00Z"),
    resume("resume-other", "jd-other", "2026-08-24T00:00:00Z"),
    { ...resume("resume-failed", "jd-same", "2026-08-25T00:00:00Z"),
      qualityStatus: "needs_revision" as const },
  ]);

  const result = await findResumeReuseCandidates({
    targetJdId: target.id, limit: 10, jds, resumes,
  });
  assert.deepEqual(result.candidates.map((item) => item.resumeId), [
    "resume-same", "resume-overlap",
  ]);
  assert.equal(result.candidates[0]?.retrievalSignals.sameTargetRole, true);
  assert.deepEqual(
    result.candidates[1]?.retrievalSignals.overlappingKeywords,
    ["node.js", "typescript"],
  );
});

test("reuse retrieval includes the newest ready local draft for the exact JD", async () => {
  const target = jd("jd-1", "产品经理", ["数据产品"]);
  const fixture = await createReadySaveFixture();
  const ready = localDraft("local-ready", fixture.ready);
  const result = await findResumeReuseCandidates({
    targetJdId: target.id,
    limit: 10,
    jds: jdReader([target]),
    resumes: resumeReader([]),
    drafts: localDraftReader([ready]),
  });

  assert.equal(result.candidates[0]?.baseKind, "local");
  assert.equal(result.candidates[0]?.artifactId, "local-ready");
  assert.equal(result.candidates[0]?.retrievalSignals.exactSourceJd, true);
  assert.ok(result.candidates[0]?.sourceExperienceIds.includes("work-1"));
});

test("get_resume reads a ready local candidate by artifactId", async () => {
  const target = jd("jd-1", "产品经理", ["数据产品"]);
  const fixture = await createReadySaveFixture();
  const ready = localDraft("local-readable", fixture.ready);
  const tools = createResumeReadTools(
    resumeReader([]),
    jdReader([target]),
    localDraftReader([ready]),
  );
  const get = tools.find((tool) => tool.name === "get_resume")!;
  const result = await get.execute("read-local", { artifactId: ready.artifactId });

  assert.equal(result.details.source, "local");
  assert.equal(result.details.id, ready.artifactId);
  assert.equal(result.details.qualityStatus, "passed");
});

test("Resume read surface exposes reuse retrieval only with JD access", () => {
  const resumes = resumeReader([]);
  const jds = jdReader([]);
  assert.deepEqual(createResumeReadTools(resumes).map((tool) => tool.name), [
    "list_resumes", "get_resume",
  ]);
  assert.deepEqual(createResumeReadTools(resumes, jds).map((tool) => tool.name), [
    "list_resumes", "get_resume", "find_resume_reuse_candidates",
  ]);
});

test("create_resume_workspace seeds only current grounded evidence and recalculates JD coverage", async () => {
  const builder = createWorkspaceSnapshotBuilder({
    jdRequirements: [{
      id: "req-new", text: "需要 Python 数据产品经验", category: "domain",
      importance: "high", keywords: ["Python"], weight: 1,
      v2Importance: "must_have", v2Category: "domain",
    }],
  });
  const snapshot = await builder.build({
    jdId: "jd-1", experienceIds: ["work-1"],
    template: (await import("../src/resume/template-contract.js"))
      .STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const structure = buildResumeSkeleton(snapshot, ["work-1"], "zh-CN");
  const evidence = allEvidenceCandidates(snapshot).find((item) =>
    item.experienceId === "work-1" && item.sourceQuote.includes("Python"),
  )!;
  const work = structure.sections.find((section) => section.type === "experience")!
    .items.find((item) => item.source_experience_id === "work-1")!;
  work.bullets.push({
    id: "historical-bullet", text: "使用 Python 清洗运营数据产品",
    matched_jd_requirement_ids: ["old-requirement"],
    source_evidence: [{
      experience_id: evidence.experienceId,
      revision_id: evidence.revisionId,
      revision_content_hash: evidence.revisionContentHash,
      source_start: evidence.sourceStart, source_end: evidence.sourceEnd,
      source_quote: evidence.sourceQuote,
    }],
  });
  const base = {
    ...cloudResumeFixture(structure),
    id: "resume-base", jdId: "jd-old", contentHash: "base-content-hash",
  };
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    builder, new FixtureResumeCompiler(), store, resumeReader([base]),
  );
  const input = {
    jdId: "jd-1", baseResumeId: "resume-base", language: "zh-CN" as const,
    experiences: [{
      experienceId: "work-1", tier: "main" as const,
      localizedPosition: "数据分析实习生",
    }],
  };
  const first = await create.execute("reuse-1", input);
  const workspace = store.latest()!;
  assert.equal(first.details.reuseBase.retainedBulletCount, 1);
  assert.equal(workspace.reuseBase?.resumeId, "resume-base");
  assert.equal(workspace.bindings[0]?.bulletId, "historical-bullet");
  assert.deepEqual(workspace.bindings[0]?.matchedRequirementIds, ["req-new"]);
  assert.deepEqual(
    work.bullets[0]?.matched_jd_requirement_ids,
    ["old-requirement"],
    "published base must remain immutable",
  );
  const repeated = await create.execute("reuse-2", input);
  assert.equal(repeated.details.sourceSelection.mode, "unchanged");
  assert.equal(store.latest()?.candidateId, workspace.candidateId);
});

test("create_resume_workspace seeds a ready local draft without publishing it", async () => {
  const fixture = await createReadySaveFixture();
  const draft = localDraft("local-ready-base", fixture.ready);
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
    resumeReader([]),
    localDraftReader([draft]),
  );
  const result = await create.execute("local-reuse", {
    jdId: "jd-1",
    baseDraftArtifactId: draft.artifactId,
    language: "zh-CN",
    experiences: [{
      experienceId: "work-1",
      tier: "main",
      localizedPosition: "数据分析实习生",
    }],
  });

  assert.equal(result.details.reuseBase.kind, "local");
  assert.equal(result.details.reuseBase.resumeId, draft.artifactId);
  assert.ok(result.details.reuseBase.retainedBulletCount > 0);
  assert.equal(result.details.status, "ready_for_approval");
  assert.equal(store.latest()?.reuseBase?.kind, "local");
});

test("workspace rejects a base whose historical evidence no longer matches", async () => {
  const builder = createWorkspaceSnapshotBuilder();
  const snapshot = await builder.build({
    jdId: "jd-1", experienceIds: ["work-1"],
    template: (await import("../src/resume/template-contract.js"))
      .STANDARD_RESUME_TEMPLATE_SNAPSHOT,
  });
  const structure = buildResumeSkeleton(snapshot, ["work-1"], "zh-CN");
  structure.sections.find((section) => section.type === "experience")!
    .items[0]!.bullets.push({
      id: "stale", text: "历史文本", matched_jd_requirement_ids: [],
      source_evidence: [{
        experience_id: "work-1", revision_id: "stale-revision",
        revision_content_hash: "stale-hash", source_start: 0, source_end: 4,
        source_quote: "历史文本",
      }],
    });
  const base = { ...cloudResumeFixture(structure), id: "stale-base", jdId: "jd-old" };
  const create = createResumeWorkspaceTool(
    builder, new FixtureResumeCompiler(), new ResumeWorkspaceStore(),
    resumeReader([base]),
  );
  await assert.rejects(create.execute("stale", {
    jdId: "jd-1", baseResumeId: "stale-base", language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }), /没有与当前 Experience 修订一致/u);
});

function jd(id: string, targetRole: string, keywords: string[]): JdRecord {
  return {
    id, title: targetRole, company: "Example", targetRole, rawText: targetRole,
    requirements: [{
      id: `${id}-req`, text: keywords.join(" "), category: "skill",
      importance: "high", keywords, weight: 1,
      v2Importance: "must_have", v2Category: "skill",
    }],
    jdHash: `${id}-hash`, requirementMapId: `${id}-map`,
    requirementsOrigin: "parsed", sourceThreadId: null, entityVersion: 1,
    deletedAt: null, createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
  };
}

function jdReader(values: JdRecord[]): JdReader {
  const byId = new Map(values.map((value) => [value.id, value]));
  return {
    listJds: async () => ({ items: values, nextCursor: null }),
    getJd: async (id) => {
      const value = byId.get(id);
      if (!value) throw new Error(`missing JD ${id}`);
      return structuredClone(value);
    },
  };
}

function resume(id: string, jdId: string, updatedAt: string) {
  return {
    ...cloudResumeFixture(), id, jdId, title: id,
    contentHash: `${id}-hash`, updatedAt,
  };
}

function resumeReader(
  values: ReturnType<typeof cloudResumeFixture>[],
): ResumePublicationGateway {
  const byId = new Map(values.map((value) => [value.id, value]));
  return {
    listResumes: async () => structuredClone(values),
    getResume: async (id) => {
      const value = byId.get(id);
      if (!value) throw new Error(`missing Resume ${id}`);
      return structuredClone(value);
    },
    publishNew: async () => { throw new Error("not used"); },
    publishExisting: async () => { throw new Error("not used"); },
  };
}

function localDraft(
  artifactId: string,
  workspace: Awaited<ReturnType<typeof createReadySaveFixture>>["ready"],
): LocalResumeDraft {
  return {
    schemaVersion: "local-resume-draft-v1",
    artifactId,
    ownerId: "user-1",
    conversationIds: ["conversation-1"],
    title: workspace.sourceSnapshot.jd.title,
    createdAt: "2026-08-26T00:00:00Z",
    updatedAt: "2026-08-27T00:00:00Z",
    workspace: structuredClone(workspace),
    checkpoints: [],
    pendingChange: null,
    cloudLink: null,
  };
}

function localDraftReader(values: LocalResumeDraft[]) {
  const byId = new Map(values.map((value) => [value.artifactId, value]));
  return {
    listReusableDrafts: async () => structuredClone(values),
    getReusableDraft: async (artifactId: string) => {
      const value = byId.get(artifactId);
      if (!value) throw new Error(`missing local draft ${artifactId}`);
      return structuredClone(value);
    },
  };
}

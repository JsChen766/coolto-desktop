import assert from "node:assert/strict";
import test from "node:test";

import { createLocalResumeDraft } from "../src/resume/draft/projection.js";
import type { LocalResumeDraft } from "../src/resume/draft/types.js";
import {
  buildDraftPdfExportPayload,
  isExportableWorkspace,
} from "../src/resume/export/draft-export.js";
import { ResumePdfExportError } from "../src/resume/export/errors.js";
import { resumePdfFilename } from "../src/resume/export/filename.js";
import { sha256, stableStringify } from "../src/resume/stable-snapshot.js";
import { buildDraftSavePayload } from "../src/resume/save/draft-save.js";
import type { ResumeWorkspace } from "../src/resume/workspace/types.js";
import { ResumeCandidatePreparer } from "../src/resume/workspace/candidate-preparer.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import {
  FixtureResumeCompiler,
  createWorkspaceSnapshotBuilder,
} from "./support/resume-workspace-fixture.js";

test("buildDraftPdfExportPayload returns a frozen payload for a qualified draft", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const payload = buildDraftPdfExportPayload({
    draft,
    expectedRevision: workspace.revision,
  });

  assert.equal(payload.source, "candidate");
  assert.equal(payload.candidateId, workspace.candidateId);
  assert.equal(payload.candidateRevision, workspace.revision);
  assert.equal(payload.title, draft.title);
  assert.equal(payload.suggestedFilename, resumePdfFilename(draft.title));
  assert.equal(
    payload.structureHash,
    sha256(stableStringify(payload.structure)),
  );

  const firstSection = payload.structure.sections[0];
  const firstItem = firstSection?.items[0];
  assert.ok(firstItem, "fixture structure must have items");
  firstItem.title = "mutated";
  assert.notEqual(
    draft.workspace.structure.sections[0]?.items[0]?.title,
    firstItem.title,
    "payload structure must be a detached clone",
  );
});

test("stale revision is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const error = await rejectExport({
    draft,
    expectedRevision: workspace.revision + 1,
  });
  assert.equal(error.code, "stale_candidate_revision");
});

test("unmerged pending change is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const pendingDraft: LocalResumeDraft = {
    ...draft,
    pendingChange: {
      id: "pending-1",
      createdAt: "2026-07-25T00:00:00Z",
      summary: "AI 修改简历内容",
      changedBulletIds: [],
      base: structuredClone(workspace),
      proposed: structuredClone(workspace),
    },
  };
  const error = await rejectExport({
    draft: pendingDraft,
    expectedRevision: workspace.revision,
  });
  assert.equal(error.code, "draft_has_pending_change");
});

test("legacy workspace status does not override current mechanical gates", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    status: "needs_revision",
  });
  const payload = buildDraftPdfExportPayload({
    draft,
    expectedRevision: workspace.revision,
  });
  assert.equal(payload.candidateRevision, workspace.revision);
});

test("removed semantic quality report is not an export dependency", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    withoutQualityReport: true,
  });
  assert.equal(isExportableWorkspace(workspace), true);
});

test("legacy structure quality metadata does not override measured layout", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    qualityStatus: "failed",
  });
  assert.equal(isExportableWorkspace(workspace), true);
});

test("unqualified compile result is rejected", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    compileQualified: false,
  });
  const error = await rejectExport({ draft, expectedRevision: workspace.revision });
  assert.equal(error.code, "candidate_not_exportable");
});

test("isExportableWorkspace gates current layout and revision failures", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  assert.equal(isExportableWorkspace(workspace), true);
  assert.equal(
    isExportableWorkspace({ ...workspace, status: "writing" }),
    true,
  );
  const withoutQualityReport = { ...workspace };
  delete withoutQualityReport.qualityReport;
  assert.equal(isExportableWorkspace(withoutQualityReport), true);
  assert.equal(
    isExportableWorkspace({
      ...workspace,
      structure: {
        ...workspace.structure,
        quality_status: "failed",
      },
    }),
    true,
  );
  assert.equal(
    isExportableWorkspace({
      ...workspace,
      compileResult: { ...workspace.compileResult, qualified: false },
    }),
    false,
  );
  assert.equal(
    isExportableWorkspace({
      ...workspace,
      compileObservedRevision: workspace.revision - 1,
    }),
    false,
  );
  const withoutTiers = structuredClone(workspace);
  delete withoutTiers.itemTiers;
  assert.equal(
    isExportableWorkspace(withoutTiers),
    false,
    "missing Agent relevance tiers must fail closed",
  );
});

test("one-line tiered bullets can be saved when every formal gate passes", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const workItem = workspace.structure.sections
    .find((section) => section.type === "experience")?.items[0];
  const bulletId = workItem?.bullets[0]?.id;
  assert.ok(bulletId);
  const measured = workspace.compileResult.bullets.find(
    (bullet) => bullet.bulletId === bulletId,
  );
  assert.ok(measured);
  measured.lineCount = 1;
  draft.workspace = workspace;

  assert.equal(isExportableWorkspace(workspace), true);
  assert.doesNotThrow(
    () => buildDraftSavePayload({ draft, expectedRevision: workspace.revision }),
  );
});

test("chained abstract padding cannot be saved or exported", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const bullet = workspace.structure.sections
    .find((section) => section.type === "experience")?.items[0]?.bullets[0];
  assert.ok(bullet);
  bullet.text =
    "定位转化瓶颈并沉淀方法论与经验与最佳实践与标准化流程与推广策略";
  draft.workspace = workspace;

  assert.equal(isExportableWorkspace(workspace), false);
  assert.throws(
    () => buildDraftSavePayload({ draft, expectedRevision: workspace.revision }),
    /连续抽象并列词/u,
  );
  const error = await rejectExport({
    draft,
    expectedRevision: workspace.revision,
  });
  assert.equal(error.code, "candidate_not_exportable");
});

test("host save builds a new or replacement library payload from the local draft", async () => {
  const { draft, workspace } = await createQualifiedDraft({
    withoutQualityReport: true,
  });
  const created = buildDraftSavePayload({
    draft,
    expectedRevision: workspace.revision,
  });
  assert.equal(created.mode, "new_resume");
  assert.equal(created.structured.quality_status, "passed");

  const replacing = buildDraftSavePayload({
    draft: {
      ...draft,
      cloudLink: {
        resumeId: "resume-1",
        contentHash: "hash-1",
        syncedAt: draft.updatedAt,
        syncedRevision: workspace.revision,
      },
    },
    expectedRevision: workspace.revision,
  });
  assert.equal(replacing.mode, "replace_resume");
  assert.equal(replacing.resumeId, "resume-1");
  assert.equal(replacing.expectedContentHash, "hash-1");
});

test("current AI-augmented content cannot save or export before confirmation", async () => {
  const { draft, workspace } = await createQualifiedDraft();
  const item = workspace.structure.sections.flatMap((section) => section.items)[0]!;
  const bulletId = "augmented-pending";
  item.bullets.push({
    id: bulletId,
    text: "建立主动复盘和跨团队协作机制",
    matched_jd_requirement_ids: [],
  });
  workspace.compileResult.bullets.push({
    bulletId,
    lineCount: 1,
    lastLineWidthPx: 520,
    availableLineWidthPx: 600,
    lastLineRatio: 520 / 600,
    passed: true,
  });
  workspace.compileObservedRevision = workspace.revision;
  workspace.bulletProvenance = [{
    bulletId,
    itemId: item.id,
    origin: "agent_augmented",
    evidenceIds: [],
    requirementIds: [],
    confirmation: "pending",
  }];
  draft.workspace = workspace;
  assert.equal(isExportableWorkspace(workspace), false);
  assert.throws(
    () => buildDraftSavePayload({ draft, expectedRevision: workspace.revision }),
    /尚未得到用户确认/u,
  );
});

async function createQualifiedDraft(
  overrides: {
    status?: ResumeWorkspace["status"];
    withoutQualityReport?: boolean;
    qualityStatus?: "passed" | "needs_user_decision" | "failed";
    compileQualified?: boolean;
  } = {},
): Promise<{ draft: LocalResumeDraft; workspace: ResumeWorkspace }> {
  const builder = createWorkspaceSnapshotBuilder();
  const compiler = new FixtureResumeCompiler();
  const store = new ResumeWorkspaceStore();
  const preparer = new ResumeCandidatePreparer(builder, compiler, store, {
    createCandidateId: () => "draft-export-test",
  });
  const prepared = await preparer.prepare({
    jdId: "jd-1",
    experienceIds: ["edu-1", "work-1"],
    language: "zh-CN",
  });
  const workspace: ResumeWorkspace = structuredClone(prepared);
  const workItem = workspace.structure.sections
    .find((section) => section.type === "experience")?.items[0];
  assert.ok(workItem, "fixture requires one work item");
  workItem.bullets = [1, 2].map((index) => ({
    id: `confirmed-augmented-${index}`,
    text: `建立跨团队协作与持续复盘机制 ${index}`,
    matched_jd_requirement_ids: [],
  }));
  workspace.itemTiers = { [workItem.id]: "secondary" };
  workspace.bulletProvenance = workItem.bullets.map((bullet) => ({
    bulletId: bullet.id,
    itemId: workItem.id,
    origin: "agent_augmented",
    evidenceIds: [],
    requirementIds: [],
    confirmation: "confirmed",
  }));
  workspace.compileResult = await compiler.compile(workspace.structure);
  workspace.compileObservedRevision = workspace.revision;
  workspace.structure.quality_status =
    overrides.qualityStatus ?? "passed";
  workspace.status = overrides.status ?? "ready_for_approval";
  workspace.compileResult = {
    ...workspace.compileResult,
    qualified: overrides.compileQualified ?? true,
  };
  if (!overrides.withoutQualityReport) {
    workspace.qualityReport = {
      passed: true,
      blocking: false,
      issues: [],
      score: {
        overall: 1,
        weightedJdCoverage: 1,
        mustHaveCoverage: 1,
        evidenceSpecificity: 1,
        informationDiversity: 1,
      },
      repairTargets: [],
      frozenBulletIds: [],
    };
  }
  const draft = createLocalResumeDraft({
    ownerId: "user-1",
    conversationId: "c-1",
    artifactId: "draft-1",
    now: "2026-07-25T00:00:00Z",
    workspace,
  });
  return { draft, workspace };
}

async function rejectExport(input: {
  draft: LocalResumeDraft;
  expectedRevision: number;
}): Promise<ResumePdfExportError> {
  try {
    buildDraftPdfExportPayload(input);
  } catch (error) {
    assert.ok(error instanceof ResumePdfExportError);
    return error;
  }
  assert.fail("expected buildDraftPdfExportPayload to reject");
}

import assert from "node:assert/strict";
import test from "node:test";

import type { JdRecord } from "../src/api/types.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { resumeGenerationReadiness } from "../src/resume/workspace/generation-readiness.js";
import { evidenceForModel } from "../src/resume/workspace/agent-workspace-evidence.js";
import { createAddResumeMaterialTool } from "../src/tools/agent-orchestrated/add-material.js";
import { createApplyResumeContentTool } from "../src/tools/agent-orchestrated/apply-content.js";
import { createResumeWorkspaceTool } from "../src/tools/agent-orchestrated/create-workspace.js";
import { createPauseResumeForMaterialTool } from "../src/tools/agent-orchestrated/pause-for-material.js";
import { createDeclineResumeMaterialTool } from "../src/tools/agent-orchestrated/decline-material.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

function payload(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

test("missing must-have technology evidence pauses before resume writing", async () => {
  const store = new ResumeWorkspaceStore();
  const compiler = new FixtureResumeCompiler();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder({
      jdRequirements: [technicalRequirement("req-k8s", "Kubernetes 生产部署", "Kubernetes")],
    }),
    compiler,
    store,
  );

  const created = payload(await create.execute("missing-critical-skill", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1" },
      { experienceId: "work-1", tier: "main" },
    ],
  }));

  assert.equal(created.status, "needs_user_decision");
  assert.equal(created.nextAction.mode, "request_more_material");
  assert.match(created.nextAction.question, /Kubernetes/u);
  assert.equal(created.materialRequest.kind, "critical_skill");
  assert.ok(created.readiness.blockers.some(
    (blocker: { code: string }) => blocker.code === "critical_skill_evidence_missing",
  ));
});

test("must-have technology evidence passes, and only a relevant grounded answer resumes a missing skill", async () => {
  const supportedStore = new ResumeWorkspaceStore();
  const supported = payload(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder({
      jdRequirements: [technicalRequirement("req-python", "Python 数据处理", "Python")],
    }),
    new FixtureResumeCompiler(),
    supportedStore,
  ).execute("supported-critical-skill", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  assert.equal(supported.status, "writing");
  assert.notEqual(supported.nextAction.mode, "request_more_material");

  const store = new ResumeWorkspaceStore();
  const compiler = new FixtureResumeCompiler();
  const created = payload(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder({
      jdRequirements: [technicalRequirement("req-k8s", "Kubernetes 生产部署", "Kubernetes")],
    }),
    compiler,
    store,
  ).execute("missing-then-supplement", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  const add = createAddResumeMaterialTool(
    store,
    () => 9876,
  );
  const stillPaused = payload(await add.execute("add-unrelated-material", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    requestId: created.nextAction.requestId,
    experienceId: "work-1",
    facts: ["负责整理周度产品数据并输出复盘报告"],
  }));
  assert.equal(stillPaused.status, "needs_user_decision");
  assert.equal(stillPaused.materialRequest.kind, "critical_skill");

  const resumed = payload(await add.execute("add-critical-skill", {
    candidateId: created.candidateId,
    expectedRevision: stillPaused.revision,
    requestId: stillPaused.nextAction.requestId,
    experienceId: "work-1",
    facts: ["使用 Kubernetes 部署数据服务并完成发布检查"],
  }));

  assert.equal(resumed.status, "writing");
  assert.equal("materialRequest" in resumed, false);
  assert.notEqual(resumed.nextAction.mode, "request_more_material");
});

test("missing domain or soft-skill evidence does not masquerade as a critical technology gap", async () => {
  const store = new ResumeWorkspaceStore();
  const requirement = technicalRequirement(
    "req-domain",
    "医疗行业商业化经验",
    "医疗行业",
  );
  requirement.category = "domain";
  requirement.v2Category = "domain";
  const created = payload(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder({ jdRequirements: [requirement] }),
    new FixtureResumeCompiler(),
    store,
  ).execute("domain-is-not-technology", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));

  assert.equal(created.status, "writing");
  assert.notEqual(created.nextAction.mode, "request_more_material");
});

test("Agent can pause for one material question and resume from the user answer", async () => {
  const store = new ResumeWorkspaceStore();
  const compiler = new FixtureResumeCompiler();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    compiler,
    store,
  );
  const created = payload(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "edu-1" },
      { experienceId: "work-1", tier: "main" },
    ],
  }));
  const pause = createPauseResumeForMaterialTool(store);
  const paused = payload(await pause.execute("pause", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    reason: "现有证据没有可继续展开的结果事实",
    question: "你在这段数据产品经历中还取得过哪些可量化成果？",
    targetExperienceId: "work-1",
  }));

  assert.equal(paused.status, "needs_user_decision");
  assert.equal(paused.revision, created.revision + 1);
  assert.equal(paused.nextAction.mode, "request_more_material");
  assert.match(paused.nextAction.question, /可量化成果/u);
  assert.equal(store.latest()!.compileObservedRevision, paused.revision);

  const apply = createApplyResumeContentTool(compiler, store);
  const blocked = payload(await apply.execute("blocked", {
    candidateId: created.candidateId,
    expectedRevision: paused.revision,
    bulletUpdates: [{ bulletId: "not-used", text: "不应写入" }],
  }));
  assert.equal(blocked.revision, paused.revision);
  assert.match(blocked.writeRejectedReason, /等待用户补充素材/u);

  const add = createAddResumeMaterialTool(store, () => 1234);
  const resumed = payload(await add.execute("add", {
    candidateId: created.candidateId,
    expectedRevision: paused.revision,
    requestId: paused.nextAction.requestId,
    experienceId: "work-1",
    facts: ["将周报处理时间缩短了 30%"],
  }));
  assert.equal(resumed.status, "writing");
  assert.equal(resumed.revision, paused.revision + 1);
  assert.equal("materialRequest" in resumed, false);
  assert.equal(store.latest()!.materialRequest, undefined);
  assert.match(JSON.stringify(resumed.addedEvidence), /缩短了 30%/u);

  const originalEvidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1");
  assert.ok(originalEvidence.length >= 2);
  const supplemented = payload(await apply.execute("supplemented", {
    candidateId: created.candidateId,
    expectedRevision: resumed.revision,
    items: [{
      itemId: "item-work-1",
      bullets: [
        {
          text: "使用 Python 清洗运营数据产品",
          origin: "grounded",
          evidenceIds: [originalEvidence[0]!.evidenceId],
          requirementIds: ["req-1"],
        },
        {
          text: "为 3 个团队建立周度报表",
          origin: "grounded",
          evidenceIds: [originalEvidence[1]!.evidenceId],
          requirementIds: ["req-1"],
        },
        {
          text: "将周报处理时间缩短了 30%",
          origin: "grounded",
          evidenceIds: [resumed.addedEvidence[0].evidenceId],
          requirementIds: ["req-1"],
        },
      ],
    }],
  }));
  assert.equal(supplemented.operation.status, "success");
  assert.equal(
    resumeGenerationReadiness(store.latest()!).blockers.some(
      (blocker) => blocker.code === "grounded_evidence_missing" &&
        blocker.bulletId === "item-work-1-bullet-3",
    ),
    false,
  );
});

test("partial material answers narrow the gap and an explicit decline ends the request", async () => {
  const store = new ResumeWorkspaceStore();
  const created = payload(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
  ).execute("create-partial-material", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "tiny-work-1", tier: "main" },
      { experienceId: "work-1", tier: "secondary" },
    ],
  }));
  assert.match(created.nextAction.question, /至少 2 条/u);

  const add = createAddResumeMaterialTool(store, () => 2_000);
  const partial = payload(await add.execute("partial-answer", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    requestId: created.nextAction.requestId,
    experienceId: "tiny-work-1",
    facts: ["与产品团队核对每周异常数据并记录处理结论"],
  }));
  assert.equal(partial.status, "needs_user_decision");
  assert.equal(partial.nextAction.mode, "request_more_material");
  assert.match(partial.nextAction.question, /至少 1 条/u);
  assert.notEqual(partial.nextAction.requestId, created.nextAction.requestId);
  await assert.rejects(
    add.execute("stale-request-answer", {
      candidateId: partial.candidateId,
      expectedRevision: partial.revision,
      requestId: created.nextAction.requestId,
      experienceId: "tiny-work-1",
      facts: ["这条事实不应写入"],
    }),
    /requestId 与当前材料请求不一致/u,
  );

  const declined = payload(await createDeclineResumeMaterialTool(
    store,
    () => 2_001,
  ).execute("no-more-facts", {
    candidateId: partial.candidateId,
    expectedRevision: partial.revision,
    requestId: partial.nextAction.requestId,
  }));
  assert.equal(declined.materialRequest.status, "declined");
  assert.equal(declined.nextAction.mode, "stop_insufficient_material");
  assert.match(declined.terminalInstruction, /未达到交付门槛/u);

  const resumed = payload(await add.execute("later-answer", {
    candidateId: declined.candidateId,
    expectedRevision: declined.revision,
    requestId: declined.nextAction.requestId,
    experienceId: "tiny-work-1",
    facts: ["维护周度指标报表并向业务负责人同步数据偏差"],
  }));
  assert.equal(resumed.status, "writing");
  assert.equal("materialRequest" in resumed, false);
  assert.equal(resumed.nextAction.mode, "repair_bullet_counts");
});

test("pause ignores a search-result short id that is not a workspace experience id", async () => {
  const store = new ResumeWorkspaceStore();
  const created = payload(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
  ).execute("create-before-short-reference", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  const paused = payload(await createPauseResumeForMaterialTool(store).execute(
    "pause-with-short-reference",
    {
      candidateId: created.candidateId,
      expectedRevision: created.revision,
      reason: "现有事实不足以继续扩写",
      question: "请补充一项具体方法或结果",
      targetExperienceId: "exp_1",
    },
  ));

  assert.equal(paused.status, "needs_user_decision");
  assert.equal(paused.nextAction.mode, "request_more_material");
  assert.equal("targetExperienceId" in paused.materialRequest, false);
});

function technicalRequirement(
  id: string,
  text: string,
  keyword: string,
): JdRecord["requirements"][number] {
  return {
    id,
    text,
    category: "technical",
    importance: "high",
    keywords: [keyword],
    weight: 1,
    v2Importance: "must_have",
    v2Category: "technology",
  };
}

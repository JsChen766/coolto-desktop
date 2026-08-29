import assert from "node:assert/strict";
import test from "node:test";

import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createConfirmNoResumeMaterialTool } from
  "../src/tools/agent-orchestrated/confirm-no-material.js";
import { createPauseResumeForMaterialTool } from
  "../src/tools/agent-orchestrated/pause-for-material.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import { createApplyResumeContentTool } from
  "../src/tools/agent-orchestrated/apply-content.js";
import { createAddResumeMaterialTool } from
  "../src/tools/agent-orchestrated/add-material.js";
import { evidenceForModel } from
  "../src/resume/workspace/agent-workspace-evidence.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

function resultText(result: { content: readonly { type: string; text?: string }[] }) {
  return JSON.parse(String(result.content[0]?.text ?? "{}"));
}

async function harness() {
  const store = new ResumeWorkspaceStore();
  const compiler = new FixtureResumeCompiler();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), compiler, store,
  );
  const created = resultText(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  }));
  const workspace = store.latest()!;
  store.restore({
    ...workspace,
    reuseBase: {
      kind: "local",
      resumeId: "existing-resume",
      sourceJdId: "jd-old",
      contentHash: "hash-old",
      retainedBulletCount: 0,
      droppedBulletCount: 0,
    },
  });
  return { store, created };
}

test("a clear no-material decision unlocks neutral wording without a second message", async () => {
  const value = await harness();
  const pause = createPauseResumeForMaterialTool(value.store);
  const paused = resultText(await pause.execute("pause", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    reason: "事实不足以继续补齐篇幅",
    question: "还有哪些可验证的职责或结果？",
  }));
  assert.match(paused.nextAction.question, /^【需要补充事实】/u);

  const userMessageTimestamp = 100;
  const confirm = createConfirmNoResumeMaterialTool(
    value.store,
    () => userMessageTimestamp,
  );
  const authorized = resultText(await confirm.execute("first-no", {
    candidateId: paused.candidateId,
    expectedRevision: paused.revision,
  }));
  assert.equal(authorized.status, "writing");
  assert.notEqual(authorized.nextAction.mode, "request_more_material");
  assert.equal(
    value.store.latest()?.factNeutralAuthorization?.sourceRequestKind,
    "agent_declared",
  );
  assert.equal(value.store.latest()?.materialRequest, undefined);
});

test("neutral authorization starts with fresh closure retry state", async () => {
  const value = await harness();
  const workspace = value.store.latest()!;
  value.store.restore({
    ...workspace,
    status: "needs_user_decision",
    pageFillProgress: { consecutiveZeroGrowthRounds: 2 },
    lineRewriteProgress: {
      phase: "page_fill",
      consecutiveZeroGrowthRounds: 2,
    },
    tailRepairProgress: { byBulletId: {}, stalled: true },
    materialRequest: {
      kind: "tail_repair_stalled",
      reason: "grounded closure stalled",
      question: "是否还有更多事实？",
      requestedAt: new Date(0).toISOString(),
    },
  });
  await createConfirmNoResumeMaterialTool(value.store, () => 200).execute(
    "fresh-neutral-state",
    {
      candidateId: workspace.candidateId,
      expectedRevision: workspace.revision,
    },
  );
  assert.equal(value.store.latest()?.pageFillProgress, undefined);
  assert.equal(value.store.latest()?.lineRewriteProgress, undefined);
  assert.equal(value.store.latest()?.tailRepairProgress, undefined);
});

test("a repeated no-material decision reopens a stalled closure after manual edit", async () => {
  const value = await harness();
  const workspace = value.store.latest()!;
  value.store.restore({
    ...workspace,
    status: "needs_revision",
    factNeutralAuthorization: {
      sourceRequestKind: "tail_repair_stalled",
      confirmedAt: "2026-08-28T00:00:00.000Z",
      confirmedMessageTimestamp: 100,
    },
    tailRepairProgress: { byBulletId: {}, stalled: true },
    materialRequest: {
      kind: "tail_repair_stalled",
      reason: "事实中性收尾已停止",
      question: "当前最好草稿已保留。",
      requestedAt: "2026-08-28T00:00:00.000Z",
      status: "declined",
      resolution: "best_effort_stalled",
      respondedAt: "2026-08-28T00:00:01.000Z",
    },
  });

  const reopened = resultText(await createConfirmNoResumeMaterialTool(
    value.store,
    () => 200,
  ).execute("reopen-after-edit", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
  }));

  assert.equal(reopened.status, "writing");
  assert.equal(value.store.latest()?.materialRequest, undefined);
  assert.equal(value.store.latest()?.tailRepairProgress, undefined);
});

test("no-more-material preserves relevance tier regardless of bullet count", async () => {
  const store = new ResumeWorkspaceStore();
  const compiler = new FixtureResumeCompiler();
  const created = resultText(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), compiler, store,
  ).execute("create-first-count-closure", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "secondary" }],
  }));
  const evidence = evidenceForModel(store.latest()!.sourceSnapshot)
    .filter((entry) => entry.experienceId === "work-1").slice(0, 2);
  await createApplyResumeContentTool(compiler, store).execute(
    "write-two-grounded",
    {
      candidateId: created.candidateId,
      expectedRevision: created.revision,
      items: [{
        itemId: "item-work-1",
        bullets: evidence.map((entry) => ({
          text: entry.text.replace(/。$/u, ""),
          origin: "grounded" as const,
          evidenceIds: [entry.evidenceId],
          requirementIds: ["req-1"],
        })),
      }],
    },
  );
  const workspace = store.latest()!;
  store.restore({
    ...workspace,
    status: "needs_user_decision",
    itemTiers: { ...workspace.itemTiers, "item-work-1": "main" },
    materialRequest: {
      kind: "tail_repair_stalled",
      reason: "grounded tail repair stalled after count writing",
      question: "是否还有更多真实事实？",
      requestedAt: new Date(0).toISOString(),
    },
  });
  await createConfirmNoResumeMaterialTool(store, () => 300).execute(
    "demote-main-on-opt-out",
    { candidateId: workspace.candidateId, expectedRevision: workspace.revision },
  );
  assert.equal(store.latest()?.itemTiers?.["item-work-1"], "main");
  assert.equal(
    store.latest()?.factNeutralAuthorization?.sourceRequestKind,
    "tail_repair_stalled",
  );
});

test("scenario probes are optional but must wait for the user's answer", async () => {
  const value = await harness();
  const pause = createPauseResumeForMaterialTool(value.store);
  const paused = resultText(await pause.execute("pause", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    reason: "事实不足以继续补齐篇幅",
    question: "还有哪些可验证的职责或结果？",
  }));
  let userMessageTimestamp = 100;
  const confirm = createConfirmNoResumeMaterialTool(
    value.store,
    () => userMessageTimestamp,
  );
  const probed = resultText(await confirm.execute("probe", {
    candidateId: paused.candidateId,
    expectedRevision: paused.revision,
    scenarioQuestions: ["你是否做过同业对比、数据分析或模型测算？"],
  }));
  assert.equal(probed.status, "needs_user_decision");
  assert.match(probed.nextAction.question, /^【帮你一起回忆】/u);
  assert.match(probed.nextAction.question, /同业对比/u);
  assert.match(probed.terminalInstruction, /立即停止所有工具调用/u);
  assert.match(probed.terminalInstruction, /同业对比/u);
  assert.equal(value.store.latest()?.factNeutralAuthorization, undefined);

  await assert.rejects(confirm.execute("same-message-no", {
    candidateId: probed.candidateId,
    expectedRevision: probed.revision,
  }), /必须等待用户回答/u);
  userMessageTimestamp = 200;
  const authorized = resultText(await confirm.execute("answered-no", {
    candidateId: probed.candidateId,
    expectedRevision: probed.revision,
  }));
  assert.equal(authorized.status, "writing");
  assert.notEqual(authorized.nextAction.mode, "request_more_material");
  assert.equal(
    value.store.latest()?.factNeutralAuthorization?.sourceRequestKind,
    "agent_declared",
  );
  assert.equal(value.store.latest()?.materialRequest, undefined);
});

test("user can skip a critical-skill warning without inventing the skill", async () => {
  const value = await harness();
  const workspace = value.store.latest()!;
  value.store.replace({
    ...workspace,
    sourceSnapshot: {
      ...workspace.sourceSnapshot,
      jd: {
        ...workspace.sourceSnapshot.jd,
        requirements: [{
          ...workspace.sourceSnapshot.jd.requirements[0]!,
          id: "req-k8s",
          text: "Kubernetes 生产部署",
          keywords: ["Kubernetes"],
          category: "technical",
          v2Category: "technology",
          importance: "high",
          v2Importance: "must_have",
        }],
      },
    },
    status: "needs_user_decision",
    materialRequest: {
      kind: "critical_skill",
      reason: "缺少关键技能证据",
      question: "【需要补充事实】请补充直接技能证据",
      requestedAt: new Date().toISOString(),
    },
  }, workspace.revision);
  const confirm = createConfirmNoResumeMaterialTool(value.store, () => 100);
  const skipped = resultText(await confirm.execute("skip-critical-warning", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
  }));
  assert.equal(skipped.status, "writing");
  assert.equal(value.store.latest()?.materialRequest, undefined);
  assert.equal(
    value.store.latest()?.factNeutralAuthorization?.sourceRequestKind,
    "critical_skill",
  );
  assert.equal(skipped.readiness.blockers.some(
    (blocker: { code: string }) =>
      blocker.code === "critical_skill_evidence_missing",
  ), false);
  assert.ok(skipped.readiness.warnings.some(
    (warning: { code: string }) =>
      warning.code === "critical_skill_evidence_missing",
  ));

  const supplemented = resultText(await createAddResumeMaterialTool(
    value.store,
    () => 200,
  ).execute("resolve-skipped-warning", {
    candidateId: skipped.candidateId,
    expectedRevision: skipped.revision,
    experienceId: "work-1",
    facts: ["使用 Kubernetes 部署数据服务并完成发布检查"],
  }));
  assert.equal(value.store.latest()?.factNeutralAuthorization, undefined);
  assert.equal(value.store.latest()?.evidenceAssessment, undefined);
  assert.equal(supplemented.readiness.warnings.some(
    (warning: { code: string }) =>
      warning.code === "critical_skill_evidence_missing",
  ), false);
});

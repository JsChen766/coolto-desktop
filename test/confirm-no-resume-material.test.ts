import assert from "node:assert/strict";
import test from "node:test";

import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createConfirmNoResumeMaterialTool } from
  "../src/tools/agent-orchestrated/confirm-no-material.js";
import { createPauseResumeForMaterialTool } from
  "../src/tools/agent-orchestrated/pause-for-material.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
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
  return { store, created };
}

test("no-material flow probes concrete job scenarios before neutral unlock", async () => {
  const value = await harness();
  const pause = createPauseResumeForMaterialTool(value.store);
  const paused = resultText(await pause.execute("pause", {
    candidateId: value.created.candidateId,
    expectedRevision: value.created.revision,
    reason: "事实不足以继续补齐篇幅",
    question: "还有哪些可验证的职责或结果？",
  }));
  assert.match(paused.nextAction.question, /^【需要补充事实】/u);

  let userMessageTimestamp = 100;
  const confirm = createConfirmNoResumeMaterialTool(
    value.store,
    () => userMessageTimestamp,
  );
  await assert.rejects(confirm.execute("missing-probes", {
    candidateId: paused.candidateId,
    expectedRevision: paused.revision,
  }), /必须先提交 3–6 个岗位场景问题/u);
  const probed = resultText(await confirm.execute("first-no", {
    candidateId: paused.candidateId,
    expectedRevision: paused.revision,
    scenarioQuestions: [
      "你是否整理过面向管理层或客户的研究结论？",
      "你是否做过同业对比、数据分析或模型测算？",
      "你是否参与过跨团队核对信息或准备汇报材料？",
    ],
  }));
  assert.equal(probed.status, "needs_user_decision");
  assert.match(probed.nextAction.question, /^【帮你一起回忆】/u);
  assert.match(probed.nextAction.question, /同业对比/u);
  assert.match(probed.terminalInstruction, /立即停止所有工具调用/u);
  assert.match(probed.terminalInstruction, /同业对比/u);
  assert.equal(value.store.latest()?.factNeutralAuthorization, undefined);

  await assert.rejects(
    confirm.execute("same-message-no", {
      candidateId: probed.candidateId,
      expectedRevision: probed.revision,
    }),
    /场景回答必须来自用户的新消息/u,
  );

  userMessageTimestamp = 200;
  const authorized = resultText(await confirm.execute("second-no", {
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

test("critical-skill material pause cannot be bypassed with neutral content", async () => {
  const value = await harness();
  const workspace = value.store.latest()!;
  value.store.replace({
    ...workspace,
    status: "needs_user_decision",
    materialRequest: {
      kind: "critical_skill",
      reason: "缺少关键技能证据",
      question: "【需要补充事实】请补充直接技能证据",
      requestedAt: new Date().toISOString(),
    },
  }, workspace.revision);
  const confirm = createConfirmNoResumeMaterialTool(value.store, () => 100);
  await assert.rejects(confirm.execute("no", {
    candidateId: workspace.candidateId,
    expectedRevision: workspace.revision,
  }), /不允许用中性内容代替/u);
});

import assert from "node:assert/strict";
import test from "node:test";

import { createResumeGenerationFollowUp } from
  "../src/desktop/main/resume-generation-follow-up.js";
import { createResumeInteractionStop } from
  "../src/desktop/main/resume-interaction-stop.js";
import { hasNoMoreResumeMaterialIntent } from
  "../src/desktop/main/no-material-intent.js";
import { resumeAgentNextAction } from
  "../src/resume/workspace/agent-next-action.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("skipping a critical-skill warning is an explicit no-material decision", () => {
  assert.equal(hasNoMoreResumeMaterialIntent("没有相关经历，跳过这个警告"), true);
  assert.equal(hasNoMoreResumeMaterialIntent("skip this warning and continue"), true);
});

test("material questions never queue an automatic resume follow-up", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
  );
  await create.execute("insufficient-material", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  });
  forceMaterialBoundary(store);

  const action = resumeAgentNextAction(store.latest()!);
  const question = action.mode === "request_more_material" ? action.question! : "";
  const assistant = {
    role: "assistant",
    content: [{ type: "text", text: question }],
    timestamp: 1,
  } as never;
  assert.equal(createResumeGenerationFollowUp(store)(1, assistant), undefined);
  const shouldStop = createResumeInteractionStop(store);
  assert.equal(shouldStop({ toolResults: [], message: assistant } as never), false);
  const stoppedAssistant = {
    role: "assistant",
    content: [{ type: "text", text: "已停止。" }],
    timestamp: 2,
  } as never;
  assert.equal(shouldStop({
    toolResults: [],
    message: stoppedAssistant,
  } as never), false);
  assert.equal(shouldStop({ toolResults: [{}] } as never), false);
});

test("a host material boundary stops after the tool even if quotes would differ", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), new FixtureResumeCompiler(), store,
  );
  await create.execute("quote-boundary", {
    jdId: "jd-1", language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  });
  forceMaterialBoundary(store);
  const workspace = store.latest()!;
  store.restore({
    ...workspace,
    materialRequest: {
      ...workspace.materialRequest!,
      question: "【需要补充事实】请说明是否做过“CADD”项目。",
    },
  });
  const action = resumeAgentNextAction(store.latest()!);
  assert.equal(action.mode, "request_more_material");
  const question = action.mode === "request_more_material"
    ? action.question!.replace(/[“”]/gu, '"') : "";
  const assistant = {
    role: "assistant",
    content: [{ type: "text", text: question }],
    timestamp: 2,
  } as never;

  assert.equal(createResumeGenerationFollowUp(store)(1, assistant), undefined);
  assert.equal(createResumeInteractionStop(store)({
    toolResults: [{
      toolName: "apply_resume_content",
      isError: false,
      details: {},
    }],
    message: assistant,
  } as never), true);
});

test("a text-only stop at an existing material boundary requires one resolution tool", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), new FixtureResumeCompiler(), store,
  );
  await create.execute("insufficient-material", {
    jdId: "jd-1", language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  });
  forceMaterialBoundary(store);
  const userTimestamp = Date.now() + 1_000;
  const followUp = createResumeGenerationFollowUp(store, () => userTimestamp)(
    2,
    { role: "assistant", content: [{ type: "text", text: "已停止。" }],
      timestamp: userTimestamp } as never,
  );
  assert.equal(typeof followUp, "object");
  assert.equal(typeof followUp === "object" && followUp?.requireToolCall, true);
  assert.match(typeof followUp === "object" ? followUp.instruction : "", /decline_resume_material/u);
});

test("a no-material signal sent before the boundary skips the newly-created question", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), new FixtureResumeCompiler(), store,
  );
  const userTimestamp = Date.now() - 1_000;
  await create.execute("same-turn-insufficient", {
    jdId: "jd-1", language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  });
  forceMaterialBoundary(store, new Date().toISOString());
  const action = resumeAgentNextAction(store.latest()!);
  assert.equal(action.mode, "request_more_material");
  const followUp = createResumeGenerationFollowUp(
    store,
    () => userTimestamp,
    () => "我已经没有更多材料可以补充，请按现有信息完成",
  )(3, {
    role: "assistant",
    content: [{ type: "text", text: "请补充更多事实" }],
    timestamp: Date.now(),
  } as never);

  assert.equal(typeof followUp, "object");
  assert.equal(typeof followUp === "object" && followUp?.requireToolCall, true);
  assert.match(typeof followUp === "object" ? followUp.instruction : "",
    /confirm_no_resume_material/u);
  assert.match(typeof followUp === "object" ? followUp.instruction : "",
    /不能再次显示或改写材料问题/u);
});

test("a repeated no-material signal reopens a stalled neutral closure", async () => {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), new FixtureResumeCompiler(), store,
  );
  await create.execute("stalled-neutral", {
    jdId: "jd-1", language: "zh-CN",
    experiences: [
      { experienceId: "work-1", tier: "main" },
      { experienceId: "tiny-work-1", tier: "secondary" },
    ],
  });
  const workspace = store.latest()!;
  store.restore({
    ...workspace,
    status: "needs_user_decision",
    materialRequest: {
      ...workspace.materialRequest!,
      kind: "tail_repair_stalled",
      reason: "事实中性尾行收尾已用尽安全改写仍未能达到门槛",
      question: "当前最好草稿已保留。",
      discoveryStage: "guidance",
      status: "declined",
      resolution: "best_effort_stalled",
      respondedAt: "2026-08-28T00:00:00.000Z",
    },
  });
  assert.equal(resumeAgentNextAction(store.latest()!).mode,
    "stop_insufficient_material");

  const followUp = createResumeGenerationFollowUp(
    store,
    () => Date.now(),
    () => "我没有更多材料了，请按现有内容继续完成",
  )(4, {
    role: "assistant",
    content: [{ type: "text", text: "当前草稿尚未达标" }],
    timestamp: Date.now(),
  } as never);

  assert.equal(typeof followUp, "object");
  assert.equal(typeof followUp === "object" && followUp?.requireToolCall, true);
  assert.match(typeof followUp === "object" ? followUp.instruction : "",
    /confirm_no_resume_material/u);
  assert.doesNotMatch(typeof followUp === "object" ? followUp.instruction : "",
    /create_resume_workspace/u);
  const shouldStop = createResumeInteractionStop(
    store,
    () => "我没有更多材料了，请按现有内容继续完成",
  );
  assert.equal(shouldStop({
    toolResults: [],
    message: {
      role: "assistant",
      content: [{ type: "text", text: "当前草稿尚未达标" }],
    },
  } as never), false, "Pi must poll the queued reopen follow-up");
});

function forceMaterialBoundary(
  store: ResumeWorkspaceStore,
  requestedAt = new Date(0).toISOString(),
) {
  const workspace = store.latest()!;
  store.restore({
    ...workspace,
    status: "needs_user_decision",
    materialRequest: {
      kind: "bullet_count_insufficient",
      reason: "事实数量不足",
      question: "【需要补充事实】请补充一项具体事实。",
      requestedAt,
      status: "awaiting_response",
    },
  });
}

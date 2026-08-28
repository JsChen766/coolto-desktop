import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { canonicalizeResumeBoundaryResponse } from
  "../src/desktop/main/resume-boundary-response.js";
import { resumeAgentNextAction } from
  "../src/resume/workspace/agent-next-action.js";
import { ResumeWorkspaceStore } from "../src/resume/workspace/workspace-store.js";
import { createDeclineResumeMaterialTool } from
  "../src/tools/agent-orchestrated/decline-material.js";
import { createPauseResumeForMaterialTool } from
  "../src/tools/agent-orchestrated/pause-for-material.js";
import { createResumeWorkspaceTool } from
  "../src/tools/agent-orchestrated/create-workspace.js";
import {
  createWorkspaceSnapshotBuilder,
  FixtureResumeCompiler,
} from "./support/resume-workspace-fixture.js";

test("material boundary replaces model process narration with the exact question", async () => {
  const { store, paused } = await pausedWorkspace();
  const question = store.latest()!.materialRequest!.question;
  const messages = [
    user("继续生成", 1),
    toolResult("pause_resume_for_material", 2),
    assistant(
      "The system determined that all remaining facts are exhausted.\n" +
        `I must stop the tool loop.\n${question}`,
      3,
    ),
  ];

  const canonical = canonicalizeResumeBoundaryResponse(
    messages,
    store.latest(),
    0,
  );
  assert.equal(assistantText(canonical.at(-1)), question);
  assert.doesNotMatch(assistantText(canonical.at(-1)), /system|tool loop/iu);
  assert.equal(paused.nextAction.mode, "request_more_material");
});

test("material boundary appends the host question without a model text turn", async () => {
  const { store } = await pausedWorkspace();
  const messages = [
    user("继续生成", 1),
    {
      role: "assistant",
      content: [{
        type: "toolCall",
        id: "pause-call",
        name: "pause_resume_for_material",
        arguments: {},
      }],
      api: "openai-completions",
      provider: "deepseek",
      model: "test-model",
      stopReason: "toolUse",
      usage: {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      timestamp: 2,
    } as AgentMessage,
    toolResult("pause_resume_for_material", 3),
  ];

  const canonical = canonicalizeResumeBoundaryResponse(
    messages,
    store.latest(),
    0,
  );

  assert.equal(canonical.length, messages.length + 1);
  assert.equal(
    assistantText(canonical.at(-1)),
    (resumeAgentNextAction(store.latest()!) as { question: string }).question,
  );
});

test("decline response is canonical but a later no-tool reply stays untouched", async () => {
  const { store, paused } = await pausedWorkspace();
  const decline = createDeclineResumeMaterialTool(store, () => 4);
  await decline.execute("decline", {
    candidateId: paused.candidateId,
    expectedRevision: paused.revision,
    requestId: paused.nextAction.requestId,
  });
  const declined = store.latest()!;
  const messages = [
    user("没有更多事实", 4),
    toolResult("decline_resume_material", 5),
    assistant("I must explain the insufficient-material state.\n已停止。", 6),
  ];
  const canonical = canonicalizeResumeBoundaryResponse(messages, declined, 0);
  assert.equal(
    assistantText(canonical.at(-1)),
    "已停止追问并保留当前草稿。由于现有事实不足，这份简历尚未达到交付门槛。",
  );

  const later = [...canonical, user("只回复：已停止。", 7), assistant("已停止。", 8)];
  const unchanged = canonicalizeResumeBoundaryResponse(
    later,
    declined,
    canonical.length,
  );
  assert.equal(assistantText(unchanged.at(-1)), "已停止。");
});

test("best-effort guard stop reports the preserved draft without a new question", async () => {
  const store = new ResumeWorkspaceStore();
  const created = result(await createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(), new FixtureResumeCompiler(), store,
  ).execute("create", {
    jdId: "jd-1", language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
  }));
  const decline = createDeclineResumeMaterialTool(store, () => undefined);
  await decline.execute("guard-stop", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    resolution: "best_effort_stalled",
  });
  const stopped = store.latest()!;
  const messages = [
    user("继续生成", 1),
    toolResult("decline_resume_material", 2),
    assistant("请再补充一项材料。", 3),
  ];
  const canonical = canonicalizeResumeBoundaryResponse(messages, stopped, 0);
  assert.equal(
    assistantText(canonical.at(-1)),
    "自动写作已停止并保留当前最好草稿。这份简历尚未达到交付门槛。",
  );
  assert.doesNotMatch(assistantText(canonical.at(-1)), /请/u);
});

async function pausedWorkspace() {
  const store = new ResumeWorkspaceStore();
  const create = createResumeWorkspaceTool(
    createWorkspaceSnapshotBuilder(),
    new FixtureResumeCompiler(),
    store,
  );
  const created = result(await create.execute("create", {
    jdId: "jd-1",
    language: "zh-CN",
    experiences: [{ experienceId: "work-1", tier: "main" }],
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
  const pause = createPauseResumeForMaterialTool(store);
  const paused = result(await pause.execute("pause", {
    candidateId: created.candidateId,
    expectedRevision: created.revision,
    reason: "现有事实不足以继续扩写",
    question: "请补充一个具体方法、执行范围、交付物或可验证结果。",
  }));
  return { store, paused };
}

function result(execution: Awaited<ReturnType<ReturnType<
  typeof createResumeWorkspaceTool
>["execute"]>>) {
  return JSON.parse(execution.content[0]!.type === "text"
    ? execution.content[0]!.text
    : "{}") as any;
}

function user(content: string, timestamp: number): AgentMessage {
  return { role: "user", content, timestamp } as AgentMessage;
}

function assistant(content: string, timestamp: number): AgentMessage {
  return { role: "assistant", content: [{ type: "text", text: content }],
    timestamp } as AgentMessage;
}

function toolResult(toolName: string, timestamp: number): AgentMessage {
  return { role: "toolResult", toolName, toolCallId: `call-${timestamp}`,
    content: [{ type: "text", text: "{}" }], isError: false,
    timestamp } as AgentMessage;
}

function assistantText(message: AgentMessage | undefined): string {
  if (message?.role !== "assistant") return "";
  return message.content.flatMap((part) => part.type === "text"
    ? [part.text]
    : []).join("\n");
}

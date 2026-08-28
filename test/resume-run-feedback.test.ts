import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import {
  appendControlledAssistantMessage,
  appendResumeRunFeedback,
  type ResumeRunFeedbackState,
} from "../src/desktop/main/resume-run-feedback.js";

test("controlled assistant notice is persisted as a public message", () => {
  const messages = [assistantText("准备审批", 1)];
  const result = appendControlledAssistantMessage(
    messages,
    "OK，已经确认要生成简历了，我现在开始生成。",
    2,
  );

  assert.equal(text(result.at(-1)), "OK，已经确认要生成简历了，我现在开始生成。");
  assert.equal(result.at(-1)?.timestamp, 2);
});

test("file-backed update reports only the successful user outcome", () => {
  const messages = appendResumeRunFeedback({
    messages: turn("请用我发的文件修改", "add_resume_material", {
      addedEvidence: [{ text: "verified" }],
    }),
    userText: "请用我发的文件修改",
    state: readyState(),
  });

  assert.equal(
    text(messages.at(-1)),
    "已根据你提供的文件完成修改。当前简历已全部达标，可以预览、保存和导出。",
  );
  assert.doesNotMatch(text(messages.at(-1)), /页面|事实校验|JD|revision|%/u);
});

test("a mechanically ready fallback resume discloses limited targeting", () => {
  const messages = appendResumeRunFeedback({
    messages: turn("我没有更多材料了", "apply_resume_content", {}),
    userText: "我没有更多材料了",
    state: { ...readyState(), targetingQuality: "limited" },
  });

  assert.match(text(messages.at(-1)), /岗位定向证据有限/u);
  assert.match(text(messages.at(-1)), /可以预览、保存和导出/u);
});

test("a skipped critical-skill warning stays visible on an exportable resume", () => {
  const messages = appendResumeRunFeedback({
    messages: turn("我没有相关经历，跳过这个警告", "confirm_no_resume_material", {}),
    userText: "我没有相关经历，跳过这个警告",
    state: {
      ...readyState(),
      targetingQuality: "limited",
      warningCodes: ["critical_skill_evidence_missing"],
    },
  });

  assert.match(text(messages.at(-1)), /关键能力仍缺少可核验的经历支持/u);
  assert.match(text(messages.at(-1)), /可以预览、保存和导出/u);
});

test("file-backed update explains natural-language gaps without metrics", () => {
  const messages = appendResumeRunFeedback({
    messages: turn("这是我的 LongBridge 作品", "add_resume_material", {
      addedEvidence: [{ text: "verified" }],
    }),
    userText: "这是我的 LongBridge 作品",
    state: incompleteState(["bullet_tail_too_short"]),
  });

  assert.match(text(messages.at(-1)), /^已根据你提供的文件完成修改，但当前简历尚未达标。/u);
  assert.match(text(messages.at(-1)), /缺口：部分经历要点的最后一行仍过短/u);
  assert.doesNotMatch(text(messages.at(-1)), /66\.7|75|页面占比|事实校验/u);
});

test("no-material confirmation refuses invention and returns the gap", () => {
  const messages = appendResumeRunFeedback({
    messages: turn("这些都没有", "confirm_no_resume_material", {}),
    userText: "这些都没有，你直接补充吧",
    state: incompleteState(["page_underfilled"]),
  });

  assert.match(text(messages.at(-1)), /不会补写不存在的经历/u);
  assert.match(text(messages.at(-1)), /缺口：现有内容还不足以形成完整的一页简历/u);
});

test("a file request without an applied tool result reports no modification", () => {
  const messages = appendResumeRunFeedback({
    messages: turn("用我发的文件修改", "get_resume_workspace", {}),
    userText: "用我发的文件修改",
    state: incompleteState(["bullet_tail_too_short"]),
  });

  assert.match(text(messages.at(-1)), /没有从你提供的文件中提取到可安全写入的内容/u);
  assert.match(text(messages.at(-1)), /请确认文件已成功附加/u);
});

test("an existing model summary is replaced by the controlled outcome", () => {
  const messages = turn("继续修改", "apply_resume_content", {});
  messages.push(assistantText("页面占比 97%，事实校验通过。", 4));
  const result = appendResumeRunFeedback({
    messages,
    userText: "继续修改",
    state: incompleteState(["bullet_tail_too_short"]),
  });

  assert.equal(result.length, messages.length);
  assert.match(text(result.at(-1)), /^本轮修改已完成，但当前简历尚未达标。/u);
  assert.doesNotMatch(text(result.at(-1)), /页面占比|事实校验|97%/u);
});

test("an authoritative material question remains unchanged", () => {
  const messages = turn("暂时想不到", "confirm_no_resume_material", {});
  messages.push(assistantText("【帮你一起回忆】请确认是否做过项目筛选。", 4));
  const result = appendResumeRunFeedback({
    messages,
    userText: "暂时想不到",
    state: incompleteState(["bullet_tail_too_short"]),
  });

  assert.equal(result.length, messages.length);
  assert.equal(text(result.at(-1)), "【帮你一起回忆】请确认是否做过项目筛选。");
});

function readyState(): ResumeRunFeedbackState {
  return { ready: true, violationCodes: [], blockerCodes: [] };
}

function incompleteState(violationCodes: string[]): ResumeRunFeedbackState {
  return { ready: false, violationCodes, blockerCodes: [] };
}

function turn(userText: string, toolName: string, details: object): AgentMessage[] {
  return [
    { role: "user", content: userText, timestamp: 1 } as AgentMessage,
    assistantToolCall(toolName, 2),
    {
      role: "toolResult",
      toolCallId: "call-1",
      toolName,
      content: [{ type: "text", text: "{}" }],
      details,
      isError: false,
      timestamp: 3,
    },
  ];
}

function assistantToolCall(name: string, timestamp: number): AgentMessage {
  return {
    ...assistantBase(timestamp),
    content: [{ type: "toolCall", id: "call-1", name, arguments: {} }],
    stopReason: "toolUse",
  } as AgentMessage;
}

function assistantText(value: string, timestamp: number): AgentMessage {
  return { ...assistantBase(timestamp), content: [{ type: "text", text: value }] } as AgentMessage;
}

function assistantBase(timestamp: number) {
  return {
    role: "assistant" as const,
    api: "openai-completions" as const,
    provider: "deepseek",
    model: "test-model",
    content: [],
    stopReason: "stop" as const,
    usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    timestamp,
  };
}

function text(message: AgentMessage | undefined): string {
  if (!message || message.role !== "assistant") return "";
  return message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
}

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai";

import { isWrappedInternalPrompt } from "../../agent/internal-prompt.js";
import { resumeGenerationReadiness } from
  "../../resume/workspace/generation-readiness.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { projectConversationMessages } from "./conversation-presentation.js";

const RESUME_RESULT_TOOLS = new Set([
  "create_resume_workspace",
  "apply_resume_content",
  "add_resume_material",
  "confirm_no_resume_material",
]);

export interface ResumeRunFeedbackState {
  ready: boolean;
  violationCodes: string[];
  blockerCodes: string[];
  materialQuestion?: string;
}

export function resumeRunFeedbackState(
  workspace: ResumeWorkspace | undefined,
): ResumeRunFeedbackState | undefined {
  if (!workspace) return undefined;
  const readiness = resumeGenerationReadiness(workspace);
  return {
    ready: readiness.ready,
    violationCodes: workspace.compileResult.violations.map((item) => item.code),
    blockerCodes: readiness.blockers.map((item) => item.code),
    ...(workspace.materialRequest?.question
      ? { materialQuestion: workspace.materialRequest.question }
      : {}),
  };
}

export function appendResumeRunFeedback(input: {
  messages: AgentMessage[];
  userText: string;
  state: ResumeRunFeedbackState | undefined;
}): AgentMessage[] {
  if (!input.state) return input.messages;
  const turnStart = latestUserIndex(input.messages);
  const turn = turnStart >= 0 ? input.messages.slice(turnStart) : [];
  if (!turn.length || hasAuthoritativeQuestion(turn)) return input.messages;
  const results = turn.filter(isResumeToolResult);
  const fileIntent = /文件|附件|材料|作品|报告|模型|PPT/iu.test(input.userText);
  const noMaterialIntent = /(?:这些|全部|都).{0,8}(?:没有|没做过)|想不到|没有(?:更多|补充)|不需要补充|无需补充/iu
    .test(input.userText);
  if (!results.length && !fileIntent && !noMaterialIntent) return input.messages;
  const feedback = buildFeedback({
    state: input.state,
    fileIntent,
    noMaterialIntent,
    materialApplied: results.some(materialWasApplied),
    materialFailed: results.some((result) =>
      result.toolName === "add_resume_material" && result.isError
    ),
  });
  return appendAssistant(
    withoutTextOnlyAssistants(input.messages, turnStart),
    feedback,
    input.messages,
  );
}

export function appendControlledAssistantMessage(
  messages: AgentMessage[],
  text: string,
  timestamp = Date.now(),
): AgentMessage[] {
  return appendAssistant(messages, text, messages, timestamp);
}

function buildFeedback(input: {
  state: ResumeRunFeedbackState;
  fileIntent: boolean;
  noMaterialIntent: boolean;
  materialApplied: boolean;
  materialFailed: boolean;
}): string {
  if (input.fileIntent && !input.materialApplied) {
    return input.materialFailed
      ? "这次没有成功把你提供的文件内容写入简历，当前草稿未修改。\n" +
          "缺口：请确认文件已成功附加，并说明文件对应的经历和需要修改的部分。"
      : "这次没有从你提供的文件中提取到可安全写入的内容，当前草稿未修改。\n" +
          "缺口：请确认文件已成功附加，并说明文件对应的经历和需要修改的部分。";
  }
  const prefix = input.materialApplied
    ? "已根据你提供的文件完成修改。"
    : input.noMaterialIntent
      ? "收到，我不会补写不存在的经历。已仅基于现有内容完成修改。"
      : "本轮修改已完成。";
  if (input.state.ready) {
    return `${prefix}当前简历已全部达标，可以预览、保存和导出。`;
  }
  return `${prefix.replace(/。$/u, "")}，但当前简历尚未达标。\n` +
    `缺口：${gapDescription(input.state)}`;
}

function gapDescription(state: ResumeRunFeedbackState): string {
  const codes = new Set([...state.violationCodes, ...state.blockerCodes]);
  const gaps: string[] = [];
  if (codes.has("bullet_tail_too_short")) {
    gaps.push("部分经历要点的最后一行仍过短，需要补充更具体的方法、范围、交付物或结果");
  }
  if (codes.has("page_underfilled")) {
    gaps.push("现有内容还不足以形成完整的一页简历，需要补充更具体的工作内容或成果");
  }
  if (codes.has("page_overflow") || codes.has("multiple_pages") ||
    codes.has("page_overfilled")) {
    gaps.push("当前内容超过一页，需要继续精简低相关或重复内容");
  }
  if (codes.has("critical_skill_evidence_missing")) {
    gaps.push("目标岗位的关键能力仍缺少可核验的经历支持");
  }
  if (codes.has("supplemental_evidence_not_integrated")) {
    gaps.push("你提供的材料尚未完整写入对应经历");
  }
  if (codes.has("bullet_count_too_low")) {
    gaps.push("部分核心经历的内容还不够完整");
  }
  if (codes.has("augmented_confirmation_pending")) {
    gaps.push("补写内容仍需要你确认");
  }
  if (!gaps.length && state.materialQuestion) {
    gaps.push(stripMaterialMarker(state.materialQuestion));
  }
  return gaps.length ? gaps.join("；") : "仍有内容需要继续修改";
}

function stripMaterialMarker(value: string): string {
  return value.replace(/^【[^】]+】/u, "").trim();
}

function latestUserIndex(messages: AgentMessage[]): number {
  return messages.findLastIndex((message) =>
    message.role === "user" && !isWrappedInternalPrompt(messageText(message))
  );
}

function hasAuthoritativeQuestion(messages: AgentMessage[]): boolean {
  return projectConversationMessages(messages).some((message) =>
    message.role === "assistant" &&
    /^(?:【需要补充事实】|【帮你一起回忆】|【继续补充】)/u.test(message.content)
  );
}

function withoutTextOnlyAssistants(
  messages: AgentMessage[],
  turnStart: number,
): AgentMessage[] {
  return messages.filter((message, index) =>
    index <= turnStart || message.role !== "assistant" || hasToolCall(message)
  );
}

function hasToolCall(message: AssistantMessage): boolean {
  return message.content.some((part) => part.type === "toolCall");
}

function isResumeToolResult(message: AgentMessage): message is ToolResultMessage {
  return message.role === "toolResult" &&
    RESUME_RESULT_TOOLS.has(message.toolName);
}

function materialWasApplied(result: ToolResultMessage): boolean {
  if (result.toolName !== "add_resume_material" || result.isError) return false;
  const details = objectValue(result.details);
  return Array.isArray(details?.addedEvidence) && details.addedEvidence.length > 0;
}

function appendAssistant(
  messages: AgentMessage[],
  text: string,
  sourceMessages = messages,
  timestamp = Date.now(),
): AgentMessage[] {
  const base = [...sourceMessages].reverse().find(
    (message): message is AssistantMessage => message.role === "assistant",
  );
  if (!base) return messages;
  const {
    errorMessage: _errorMessage,
    rawStopReason: _rawStopReason,
    deferred: _deferred,
    ...safeBase
  } = structuredClone(base);
  const feedback: AssistantMessage = {
    ...safeBase,
    content: [{ type: "text", text }],
    stopReason: "stop",
    timestamp,
    usage: zeroUsage(base.usage),
  };
  return [...messages, feedback];
}

function zeroUsage(usage: AssistantMessage["usage"]): AssistantMessage["usage"] {
  return {
    ...usage,
    input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    ...(usage.reasoning === undefined ? {} : { reasoning: 0 }),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function messageText(message: AgentMessage): string {
  if (!("content" in message)) return "";
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content.flatMap((part) =>
    part.type === "text" ? [part.text] : []
  ).join("\n");
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

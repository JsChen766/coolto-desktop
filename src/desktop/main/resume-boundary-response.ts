import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { resumeAgentNextAction } from
  "../../resume/workspace/agent-next-action.js";
import type { ResumeWorkspace } from "../../resume/workspace/types.js";
import { appendControlledAssistantMessage } from "./resume-run-feedback.js";
import { crossedResumeMaterialBoundary } from
  "./resume-material-boundary.js";

const DECLINED_RESPONSE =
  "已停止追问并保留当前草稿。由于现有事实不足，这份简历尚未达到交付门槛。";
const STALLED_RESPONSE =
  "自动写作已停止并保留当前最好草稿。这份简历尚未达到交付门槛。";

/** Replaces model process narration only when this run crossed a material boundary. */
export function canonicalizeResumeBoundaryResponse(
  messages: AgentMessage[],
  workspace: ResumeWorkspace | undefined,
  startIndex: number,
): AgentMessage[] {
  if (!workspace || startIndex >= messages.length) return messages;
  const currentRun = messages.slice(startIndex);
  const toolNames = new Set(currentRun.flatMap((message) =>
    message.role === "toolResult" ? [message.toolName] : []
  ));
  const action = resumeAgentNextAction(workspace);
  let response: string | undefined;
  if (action.mode === "request_more_material" &&
    crossedResumeMaterialBoundary(currentRun.flatMap((message) =>
      message.role === "toolResult" ? [message] : []
    ))) {
    response = action.question ?? workspace.materialRequest?.question ??
      "请补充一个尚未写入的具体事实；如果没有更多事实，也请直接说明。";
  } else if (action.mode === "stop_insufficient_material" &&
    toolNames.has("decline_resume_material")) {
    response = workspace.materialRequest?.resolution === "best_effort_stalled"
      ? STALLED_RESPONSE : DECLINED_RESPONSE;
  }
  if (!response) return messages;
  const assistantIndex = messages.findLastIndex((message, index) =>
    index >= startIndex && message.role === "assistant" &&
    !message.content.some((part) => part.type === "toolCall")
  );
  if (assistantIndex < 0) {
    const timestamp = Math.max(0, ...messages.map((message) => message.timestamp)) + 1;
    return appendControlledAssistantMessage(messages, response, timestamp);
  }
  const assistant = messages[assistantIndex]!;
  if (assistant.role !== "assistant") return messages;
  const canonical = [...messages];
  canonical[assistantIndex] = {
    ...assistant,
    content: [{ type: "text", text: response }],
  };
  return canonical;
}

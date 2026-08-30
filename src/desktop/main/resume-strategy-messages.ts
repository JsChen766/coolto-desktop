import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { appendControlledAssistantMessage } from "./resume-run-feedback.js";

export function replaceFailedResumeRunWithStrategyMessage(
  messages: AgentMessage[],
  text: string,
): AgentMessage[] {
  const turnStart = messages.findLastIndex((message) => message.role === "user");
  if (turnStart < 0) return messages;
  const withControlled = appendControlledAssistantMessage(messages, text);
  if (withControlled.length === messages.length) {
    return messages.slice(0, turnStart + 1);
  }
  return [
    ...messages.slice(0, turnStart + 1),
    withControlled.at(-1)!,
  ];
}

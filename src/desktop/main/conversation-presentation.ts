import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { isWrappedInternalPrompt } from "../../agent/internal-prompt.js";
import type { ChatMessage } from "../shared/types.js";

export function projectConversationMessages(
  messages: AgentMessage[],
): ChatMessage[] {
  // The Agent transcript is recovery state, not a UI transcript. The App only
  // projects user-originated input and assistant output; host continuations,
  // system/tool traffic, and embedded reference metadata remain internal.
  const visible: ChatMessage[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return;
    const raw = extractText(message.content);
    if (isHiddenInternalPrompt(raw)) return;
    const content = stripInternalResumeReference(raw);
    if (!content.trim()) return;
    const timestamp =
      typeof message.timestamp === "number"
        ? new Date(message.timestamp).toISOString()
        : new Date().toISOString();
    visible.push({
      id: `${message.role}-${message.timestamp ?? index}-${index}`,
      role: message.role,
      content,
      createdAt: timestamp,
    });
  });
  return visible;
}

function isHiddenInternalPrompt(value: string): boolean {
  if (isWrappedInternalPrompt(value)) return true;
  const normalized = value.trim();
  return (
    /^JD「[\s\S]+」已保存到本地同步队列（jdId: [^)]+）。请根据对话历史中用户的原始意图继续下一步操作。/u.test(
      normalized,
    ) ||
    (/^浏览器写权限已授予（意图：/u.test(normalized) &&
      normalized.includes("browser_start_review"))
  );
}

function stripInternalResumeReference(value: string): string {
  return value
    .replace(/\n*<resume_reference>[\s\S]*?<\/resume_reference>\s*$/u, "")
    .trimEnd();
}

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

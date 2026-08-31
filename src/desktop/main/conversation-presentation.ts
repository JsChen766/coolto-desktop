import type { AgentMessage } from "@earendil-works/pi-agent-core";

import {
  isWrappedInternalPrompt,
  isWrappedResumeGenerationFollowUp,
} from "../../agent/internal-prompt.js";
import { presentAssistantText } from "../../agent/user-visible-text.js";
import type { ChatMessage, MessageAttachment } from "../shared/types.js";
import type { StoredMessageAttachment } from "./conversation-record.js";
import {
  INITIAL_MATERIAL_MARKER,
  SCENARIO_PROBE_MARKER,
} from "../../resume/workspace/material-question.js";

export function projectConversationMessages(
  messages: AgentMessage[],
  messageAttachments?: StoredMessageAttachment[],
  assistantTimings?: Record<string, string>,
): ChatMessage[] {
  // The Agent transcript is recovery state, not a UI transcript. The App only
  // projects user-originated input and assistant output; host continuations,
  // system/tool traffic, and embedded reference metadata remain internal.
  const attachmentsByTimestamp = new Map<number, MessageAttachment[]>();
  for (const stored of messageAttachments ?? []) {
    const group = attachmentsByTimestamp.get(stored.messageTimestamp) ?? [];
    group.push({
      fileId: stored.fileId,
      filename: stored.filename,
      type: stored.type,
      sizeBytes: stored.sizeBytes,
      status: stored.status,
    });
    attachmentsByTimestamp.set(stored.messageTimestamp, group);
  }
  const visible: ChatMessage[] = [];
  messages.forEach((message, index) => {
    if (message.role !== "user" && message.role !== "assistant") return;
    if (message.role === "assistant" && includesToolCall(message.content)) return;
    if (
      message.role === "assistant" &&
      isWrappedResumeGenerationFollowUp(
        extractText(messageContent(messages[index + 1])),
      )
    ) return;
    const raw = extractText(message.content);
    if (isHiddenInternalPrompt(raw)) return;
    if (message.role === "assistant" && isInternalResumeNarration(raw)) return;
    const content = presentConversationContent(raw, message.role);
    if (!content.trim()) return;
    const timestamp =
      typeof message.timestamp === "number"
        ? new Date(message.timestamp).toISOString()
        : new Date().toISOString();
    const attachments =
      message.role === "user"
        ? attachmentsByTimestamp.get(message.timestamp)
        : undefined;
    const completedAt =
      message.role === "assistant"
        ? assistantTimings?.[String(message.timestamp)]
        : undefined;
    visible.push({
      id: `${message.role}-${message.timestamp ?? index}-${index}`,
      role: message.role,
      content,
      createdAt: timestamp,
      ...(completedAt ? { completedAt } : {}),
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
    });
  });
  return visible;
}

function messageContent(message: AgentMessage | undefined): unknown {
  return message && "content" in message ? message.content : undefined;
}

function includesToolCall(content: unknown): boolean {
  return Array.isArray(content) && content.some((part) =>
    Boolean(
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "toolCall",
    ),
  );
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

function isInternalResumeNarration(value: string): boolean {
  const text = value.trim();
  if (!/^(?:I (?:need|should|must|will)\b|Let me\b|My previous submission)/iu.test(text)) {
    return false;
  }
  const markers = [
    "currentText", "tailRewrites", "availableEvidence", "sourceQuotes",
    "nextAction", "candidateId", "expectedRevision", "lengthBudget",
  ].filter((marker) => text.includes(marker)).length;
  return markers >= 2 && /\b(?:CJK|CEU|bulletIds?|revisedText)\b/iu.test(text);
}

export function presentConversationContent(
  value: string,
  role: "user" | "assistant",
): string {
  const stripped = value
    .replace(/\n*<resume_reference>[\s\S]*?<\/resume_reference>\s*$/u, "")
    .replace(/\n*<jd_reference>[\s\S]*?<\/jd_reference>\s*$/u, "")
    .replace(/\n*<attachment_notice>[\s\S]*?<\/attachment_notice>\s*$/u, "")
    .trimEnd();
  if (role !== "user") return presentAssistantText(authoritativeAssistantContent(stripped));
  return stripped.replace(
    /^请针对 JD「([^」]+)」（jdId:\s*[^）]+）(生成针对性简历。|匹配经历库并给出匹配结果。)$/u,
    (_match, title: string, action: string) =>
      `请为岗位「${title}」${action === "生成针对性简历。"
        ? action
        : "匹配经历库，并给出匹配结果。"}`,
  );
}

function authoritativeAssistantContent(value: string): string {
  const positions = [INITIAL_MATERIAL_MARKER, SCENARIO_PROBE_MARKER]
    .map((marker) => value.indexOf(marker))
    .filter((position) => position >= 0);
  return positions.length ? value.slice(Math.min(...positions)) : value;
}

export function presentConversationTitle(
  storedTitle: string,
  messages: AgentMessage[],
): string {
  if (!storedTitle.includes("jdId:")) return storedTitle;
  const firstUser = projectConversationMessages(messages).find(
    (message) => message.role === "user",
  );
  const normalized = (firstUser?.content ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 28) : storedTitle;
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

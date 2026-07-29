import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { safeStorage } from "electron";

import { inferArtifactAnchor } from "../shared/artifact-anchor.js";
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
} from "../shared/types.js";
import type { ResumeDraftArtifactReference } from "../../resume/draft/types.js";
import type { ExperienceImportResultArtifact } from "../../import/result-artifact.js";
import {
  presentConversationTitle,
  projectConversationMessages,
} from "./conversation-presentation.js";

export interface StoredConversation {
  version: 1 | 2;
  id: string;
  ownerId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agentMessages: AgentMessage[];
  resumeArtifacts?: ResumeDraftArtifactReference[];
  experienceImportArtifacts?: ExperienceImportResultArtifact[];
}

export const UNTITLED_CONVERSATION = "新对话";

export function encryptConversation(value: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝明文保存本地对话");
  }
  return safeStorage.encryptString(value);
}

export function decryptConversation(value: Buffer): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，无法读取本地对话");
  }
  return safeStorage.decryptString(value);
}

export function conversationSummary(
  record: StoredConversation,
): ConversationSummary {
  return {
    id: record.id,
    title: presentConversationTitle(record.title, record.agentMessages),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messageCount: projectConversationMessages(record.agentMessages).length,
  };
}

export function conversationDetail(
  record: StoredConversation,
): ConversationDetail {
  const messages = projectConversationMessages(record.agentMessages);
  return {
    ...conversationSummary(record),
    messages,
    resumeArtifacts: structuredClone(record.resumeArtifacts ?? []).map(
      (artifact) => withArtifactAnchor(artifact, messages),
    ),
    experienceImportArtifacts: structuredClone(
      record.experienceImportArtifacts ?? [],
    ).map((artifact) => withImportArtifactAnchor(artifact, messages)),
  };
}

function withImportArtifactAnchor(
  artifact: ExperienceImportResultArtifact,
  messages: ChatMessage[],
): ExperienceImportResultArtifact {
  const anchorMessageId = artifact.anchorMessageId
    ?? inferArtifactAnchor(messages, artifact.createdAt);
  return {
    ...artifact,
    ...(anchorMessageId ? { anchorMessageId } : {}),
  };
}

export function withArtifactAnchor(
  artifact: ResumeDraftArtifactReference,
  messages: ChatMessage[],
): ResumeDraftArtifactReference {
  const anchorMessageId =
    artifact.anchorMessageId ?? inferArtifactAnchor(messages, artifact.createdAt);
  return {
    ...artifact,
    ...(anchorMessageId ? { anchorMessageId } : {}),
  };
}

export function deriveConversationTitle(messages: AgentMessage[]): string {
  const firstUser = projectConversationMessages(messages).find(
    (message) => message.role === "user",
  );
  const normalized = (firstUser?.content ?? "").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 28) : UNTITLED_CONVERSATION;
}

export function assertConversationId(value: string): void {
  if (!/^[0-9a-f-]{36}$/i.test(value)) {
    throw new Error("无效的对话 ID");
  }
}

export function isStoredConversation(
  value: unknown,
): value is StoredConversation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredConversation>;
  return (
    (candidate.version === 1 || candidate.version === 2) &&
    typeof candidate.id === "string" &&
    typeof candidate.ownerId === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    Array.isArray(candidate.agentMessages) &&
    (candidate.resumeArtifacts === undefined ||
      Array.isArray(candidate.resumeArtifacts)) &&
    (candidate.experienceImportArtifacts === undefined ||
      Array.isArray(candidate.experienceImportArtifacts))
  );
}

export function isMissingConversationFile(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

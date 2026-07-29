import type { ResumeDraftArtifactReference } from "../../../resume/draft/types.js";
import type { DesktopApprovalDecision } from "./approvals.js";

export type ChatRole = "user" | "assistant";

export interface DesktopUser {
  id: string;
  email: string;
}

export interface EmailChallengeView {
  challengeId: string;
  expiresAt: string;
  retryAfterSeconds: number;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
  resumeArtifacts: ResumeDraftArtifactReference[];
}

export interface DesktopAttachment {
  id: string;
  filename: string;
  type: "pdf" | "docx" | "text" | "markdown";
  sizeBytes: number;
}

export interface AttachmentRemoveInput {
  conversationId: string;
  fileId: string;
}

export interface ConversationRenameInput {
  conversationId: string;
  title: string;
}

export interface AgentPromptInput {
  conversationId: string;
  text: string;
  resumeReference?: ResumeChatReference;
}

export interface ResumeChatReference {
  artifactId: string;
  targetType: "resume" | "bullet" | "item" | "locked_field";
  targetId: string;
  label: string;
  source?: "local" | "cloud";
  resumeId?: string;
  contentHash?: string;
  operationMode?: "read_only" | "create_local_copy";
}

export interface ApprovalResolveInput {
  conversationId: string;
  requestId: string;
  decision: DesktopApprovalDecision;
}

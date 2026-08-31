import type { ResumeDraftArtifactReference } from "../../../resume/draft/types.js";
import type { ExperienceImportResultArtifact } from "../../../import/result-artifact.js";
import type { DesktopApprovalDecision } from "./approvals.js";

export type ChatRole = "user" | "assistant";

export interface DesktopUser {
  id: string;
  email: string;
}

export interface DesktopCreditTransaction {
  amount: number;
  transactionType: string;
  createdAt: string;
}

export interface DesktopCreditSummary {
  weeklyFreeCredits: number;
  weeklyFreeExpiresAt?: string;
  creditBalance: number;
  creditExpiresAt?: string;
  planType: string;
  hasFreeTrial: boolean;
  /** 管理员不限量用户（不扣费、不计费展示）。 */
  unlimited: boolean;
  recentTransactions: DesktopCreditTransaction[];
}

export interface CheckoutPlan {
  planType: "WEEKLY" | "MONTHLY";
  priceCny: number;
  credits: number;
  validDays: number;
}

export interface CheckoutResult {
  checkoutId: string;
  afdianUrl: string;
}

export type CheckoutVerifyStatus = "completed" | "pending" | "not_found";

export interface CheckoutVerifyResult {
  status: CheckoutVerifyStatus;
  credits: number;
}

export interface CreditBalanceDetail {
  total: number;
  weeklyFree: number;
  creditBalance: number;
  estimated: number;
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
  /** assistant 消息完成时间（ISO），随聊天记录持久化。 */
  completedAt?: string;
  /** 该消息携带的附件引用（仅用户消息），重启后随聊天记录持久化。 */
  attachments?: MessageAttachment[];
}

export type MessageAttachmentStatus =
  | "pending"
  | "parsing"
  | "parsed"
  | "partial"
  | "saved"
  | "error";

export interface MessageAttachment {
  fileId: string;
  filename: string;
  type: "pdf" | "docx" | "text" | "markdown";
  sizeBytes: number;
  /** 运行时状态；持久化快照可能滞后于实时事件。 */
  status: MessageAttachmentStatus;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  /** Local-only active editing context; not part of cloud Resume state. */
  activeResumeArtifactId?: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
  resumeArtifacts: ResumeDraftArtifactReference[];
  experienceImportArtifacts: ExperienceImportResultArtifact[];
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

export interface ConversationResumeContextInput {
  conversationId: string;
  artifactId: string;
}

export interface ConversationsDesktopApi {
  list(): Promise<ConversationSummary[]>;
  create(): Promise<ConversationDetail>;
  createForResume(artifactId: string): Promise<ConversationDetail>;
  get(conversationId: string): Promise<ConversationDetail>;
  bindResume(input: ConversationResumeContextInput): Promise<ConversationDetail>;
  clearResumeContext(conversationId: string): Promise<ConversationDetail>;
  rename(input: ConversationRenameInput): Promise<ConversationSummary>;
  delete(conversationId: string): Promise<void>;
}

export interface AgentPromptInput {
  conversationId: string;
  text: string;
  resumeReference?: ResumeChatReference;
  jdReference?: JdChatReference;
  usageContext?: {
    operationType?: string;
    scenarioRunId?: string;
    operationRunId?: string;
  };
}

export interface JdChatReference {
  jdId: string;
  title: string;
  action: "generate" | "match";
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

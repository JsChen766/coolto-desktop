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

export interface AgentPromptInput {
  conversationId: string;
  text: string;
  resumeReference?: ResumeChatReference;
  jdReference?: JdChatReference;
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

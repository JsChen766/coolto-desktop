import type { JsonValue } from "../../../agent-task/json-types.js";
import type { AgentTaskStatus } from "../../../agent-task/task-types.js";

export interface AgentTaskDelegationInput {
  conversationId: string;
  goal: string;
  allowedDomains: string[];
  blockedDomains: string[];
  allowedActions: string[];
  jobCriteria: Record<string, JsonValue>;
  assetPolicy: Record<string, JsonValue>;
  answerPolicy: Record<string, JsonValue>;
  connectorPolicy?: Record<string, JsonValue>;
  unattended: boolean;
  expiresAt: string;
}

export interface AgentTaskProposalView {
  id: string;
  contentHash: string;
  input: AgentTaskDelegationInput;
  minimumMatch: 80;
  dailyApplicationLimit: null;
  mailSendAlwaysManual: true;
  appOpenOnly: true;
  rawObservationRetentionDays: 7;
  actionReceiptRetentionDays: 90;
  createdAt: string;
}

export interface AgentTaskView {
  id: string;
  conversationId: string;
  goal: string;
  status: AgentTaskStatus;
  waitingReason: string | null;
  activeRunId: string | null;
  grantId: string | null;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
}

export interface AgentTaskReceiptView {
  id: string;
  toolName: string;
  status: "succeeded" | "partial" | "blocked" | "uncertain" | "failed";
  targetOrigin: string | null;
  errorCode: string | null;
  evidenceCount: number;
  createdAt: string;
}

export interface AgentTaskActivityView {
  id: string;
  kind: "event" | "policy" | "receipt";
  title: string;
  detail: string;
  status: string;
  occurredAt: string;
}

export interface AgentTaskLeadView {
  id: string;
  company: string;
  role: string;
  location: string;
  targetUrl: string;
  state: "new" | "changed" | "unchanged" | "closed";
  score: number | null;
  shortlisted: boolean;
  rationale: string | null;
}

export interface AgentTaskDetailView {
  task: AgentTaskView;
  grant: null | {
    id: string;
    allowedDomains: string[];
    blockedDomains: string[];
    allowedActions: string[];
    unattended: boolean;
    expiresAt: string;
    revokedAt: string | null;
  };
  receipts: AgentTaskReceiptView[];
  activity: AgentTaskActivityView[];
  leads: AgentTaskLeadView[];
}

export interface AgentTaskDesktopApi {
  list(): Promise<AgentTaskView[]>;
  get(taskId: string): Promise<AgentTaskDetailView>;
  prepare(input: AgentTaskDelegationInput): Promise<AgentTaskProposalView>;
  executeProposal(proposalId: string): Promise<AgentTaskDetailView>;
  start(taskId: string): Promise<AgentTaskDetailView>;
  resume(taskId: string): Promise<AgentTaskDetailView>;
  pause(taskId: string): Promise<AgentTaskDetailView>;
  cancel(taskId: string): Promise<AgentTaskDetailView>;
  revoke(taskId: string): Promise<AgentTaskDetailView>;
  submissionReceipt(applicationId: string): Promise<SubmissionReceiptView | undefined>;
}

export interface SubmissionReceiptView {
  id: string;
  jdId: string;
  resumeId: string;
  resumeContentHash: string;
  company: string;
  role: string;
  targetUrl: string;
  siteApplicationId: string | null;
  status: "confirmed" | "pending" | "failed";
  createdAt: string;
}

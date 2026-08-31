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

export interface ResumeJobLoopPrepareInput {
  conversationId: string;
  goal: string;
  resumeId: string;
  sources: Array<{
    provider: "greenhouse" | "lever";
    sourceKey: string;
    company: string;
  }>;
  applicationDomains: string[];
  expiresAt: string;
}

export interface MailScheduleLoopPrepareInput {
  conversationId: string;
  goal: string;
  directions: Array<"received" | "sent">;
  browserWebmail: boolean;
  mailConnectionIds: string[];
  allowedDomains: string[];
  pollIntervalMinutes: number;
  expiresAt: string;
}

export interface FollowUpLoopPrepareInput {
  conversationId: string;
  goal: string;
  applicationId: string;
  allowedDomains: string[];
  checkIntervalHours: number;
  expiresAt: string;
}

export interface InterviewBriefingLoopPrepareInput {
  conversationId: string;
  goal: string;
  applicationId: string;
  interviewId: string;
  researchDomains: string[];
  wakeBeforeMinutes: number;
  expiresAt: string;
}

export interface StrategyLoopPrepareInput {
  conversationId: string;
  goal: string;
  reviewIntervalDays: number;
  expiresAt: string;
}

export interface RiskDeadlineLoopPrepareInput extends MailScheduleLoopPrepareInput {}

export type AgentTaskLoopSummary =
  | {
      kind: "resume_job_apply";
      resumeTitle: string;
      sources: string[];
    }
  | {
      kind: "application_follow_up";
      applicationId: string;
      checkIntervalHours: number;
    }
  | {
      kind: "interview_briefing";
      applicationId: string;
      interviewId: string;
      wakeBeforeMinutes: number;
    }
  | {
      kind: "application_strategy";
      reviewIntervalDays: number;
    }
  | {
      kind: "risk_deadline_watch";
      directions: Array<"received" | "sent">;
      pollIntervalMinutes: number;
    }
  | {
      kind: "mail_app_schedule";
      directions: Array<"received" | "sent">;
      pollIntervalMinutes: number;
      connections: number;
      browserWebmail: boolean;
    };

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

interface AgentTaskArtifactBaseView {
  id: string;
  title: string;
  summary: string;
  applicationId: string | null;
  createdAt: string;
}

export type AgentTaskArtifactView = AgentTaskArtifactBaseView & (
  | { kind: "follow_up_draft"; detail: {
      body: string; scheduledFor: string; timezone: string;
    } }
  | { kind: "interview_brief"; detail: {
      sections: Array<{ heading: string; content: string; sourceRefs: string[] }>;
    } }
  | { kind: "strategy_proposal"; detail: {
      recommendations: string[]; caveat: string;
    } }
  | { kind: "risk_notice"; detail: {
      severity: "review" | "high"; rationale: string;
      evidenceQuotes: string[]; deadlineAt: string | null;
    } }
);

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
    loop: AgentTaskLoopSummary | null;
  };
  receipts: AgentTaskReceiptView[];
  activity: AgentTaskActivityView[];
  leads: AgentTaskLeadView[];
  artifacts: AgentTaskArtifactView[];
}

export interface AgentTaskDesktopApi {
  list(): Promise<AgentTaskView[]>;
  get(taskId: string): Promise<AgentTaskDetailView>;
  prepare(input: AgentTaskDelegationInput): Promise<AgentTaskProposalView>;
  prepareResumeJobLoop(input: ResumeJobLoopPrepareInput): Promise<AgentTaskProposalView>;
  prepareMailScheduleLoop(input: MailScheduleLoopPrepareInput): Promise<AgentTaskProposalView>;
  prepareFollowUpLoop(input: FollowUpLoopPrepareInput): Promise<AgentTaskProposalView>;
  prepareInterviewBriefingLoop(input: InterviewBriefingLoopPrepareInput): Promise<AgentTaskProposalView>;
  prepareStrategyLoop(input: StrategyLoopPrepareInput): Promise<AgentTaskProposalView>;
  prepareRiskDeadlineLoop(input: RiskDeadlineLoopPrepareInput): Promise<AgentTaskProposalView>;
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

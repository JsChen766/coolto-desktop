import type { DesktopApprovalRequest } from "@desktop/types";
import {
  createInboxApplicationApprovalDraft,
  createInboxInterviewApprovalDraft,
} from "../../../../inbox-signals/inbox-action-approval.js";
import type {
  InboxApplicationProposalView,
  InboxInterviewProposalView,
} from "../../../../inbox-signals/inbox-action-types.js";

const now = new Date().toISOString();

function toDesktopRequest(id: string, draft: ReturnType<typeof createInboxApplicationApprovalDraft>): DesktopApprovalRequest {
  return {
    id,
    actionType: draft.actionType,
    risk: draft.risk,
    title: draft.title,
    description: draft.description,
    preview: draft.preview,
    createdAt: now,
  };
}

const applicationProposal: InboxApplicationProposalView = {
  id: "inbox-app-proposal-qa",
  taskId: "task-qa",
  signalId: "signal-app-qa",
  signalContentHash: "a".repeat(64),
  applicationId: "application-qa",
  applicationVersion: 2,
  companyName: "示例科技",
  roleName: "Agent 工程师",
  subject: "Application received",
  sender: "hr@example.com",
  confidence: 88,
  evidenceQuotes: ["We have received your application for Agent Engineer."],
  currentStatus: "applied",
  targetStatus: "screening",
  clearPendingConfirmation: false,
  preparedAt: now,
};

const interviewProposal: InboxInterviewProposalView = {
  id: "inbox-interview-proposal-qa",
  taskId: "task-qa",
  signalId: "signal-interview-qa",
  signalContentHash: "b".repeat(64),
  applicationId: "application-qa",
  companyName: "示例科技",
  roleName: "Agent 工程师",
  subject: "Interview invitation",
  sender: "hr@example.com",
  confidence: 91,
  evidenceQuotes: ["Please join us on 2026-08-20 10:00 HKT."],
  mutation: "create",
  interviewId: null,
  current: null,
  next: {
    roundNumber: 1,
    interviewType: "video",
    scheduledAt: "2026-08-20T02:00:00.000Z",
    timezone: "Asia/Hong_Kong",
    status: "scheduled",
    locationOrLink: null,
  },
  preparedAt: now,
};

export const inboxApplicationApprovalRequest = toDesktopRequest(
  "approval-inbox-application-qa",
  createInboxApplicationApprovalDraft(applicationProposal),
);

export const inboxInterviewApprovalRequest = toDesktopRequest(
  "approval-inbox-interview-qa",
  createInboxInterviewApprovalDraft(interviewProposal),
);

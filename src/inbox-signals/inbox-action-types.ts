import type { ApplicationRecord, ApplicationStatus } from "../tracker/types.js";
import type { InterviewInput, InterviewRound } from "../tracker/child-types.js";

export interface InboxApplicationProposalView {
  id: string;
  taskId: string;
  signalId: string;
  signalContentHash: string;
  applicationId: string;
  applicationVersion: number;
  companyName: string;
  roleName: string;
  subject: string;
  sender: string;
  confidence: number;
  evidenceQuotes: string[];
  currentStatus: ApplicationStatus;
  targetStatus: ApplicationStatus | null;
  clearPendingConfirmation: boolean;
  preparedAt: string;
}

export interface InboxApplicationProposalResult {
  proposalId: string;
  signalId: string;
  application: ApplicationRecord;
}

export interface InboxInterviewProposalView {
  id: string;
  taskId: string;
  signalId: string;
  signalContentHash: string;
  applicationId: string;
  companyName: string;
  roleName: string;
  subject: string;
  sender: string;
  confidence: number;
  evidenceQuotes: string[];
  mutation: "create" | "update";
  interviewId: string | null;
  current: InterviewRound | null;
  next: InterviewInput;
  preparedAt: string;
}

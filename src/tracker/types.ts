export const APPLICATION_STATUSES = [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "no_response",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
export type ApplicationDeliveryMethod =
  | "form_fill"
  | "email_fill"
  | "manual"
  | "other";
export type ApplicationSource = "manual" | "browser" | "email" | "other";
export type TrackerSyncStatus = "clean" | "pending" | "conflict";

export interface ApplicationRecord {
  id: string;
  jdId: string | null;
  resumeId: string | null;
  companyName: string;
  roleName: string;
  jdTitleSnapshot: string | null;
  resumeTitleSnapshot: string | null;
  deliveryMethod: ApplicationDeliveryMethod;
  targetUrl: string | null;
  appliedAt: string | null;
  status: ApplicationStatus;
  pendingConfirmation: boolean;
  source: ApplicationSource;
  dedupeKey: string | null;
  companyBusiness: string | null;
  roleSummary: string | null;
  companyCulture: string | null;
  rejectionReason: string | null;
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: TrackerSyncStatus;
}

export interface ApplicationCreateInput {
  jdId?: string | null;
  resumeId?: string | null;
  companyName: string;
  roleName: string;
  jdTitleSnapshot?: string | null;
  resumeTitleSnapshot?: string | null;
  deliveryMethod: ApplicationDeliveryMethod;
  targetUrl?: string | null;
  appliedAt?: string | null;
  pendingConfirmation?: boolean;
  source?: ApplicationSource;
  dedupeKey?: string | null;
  companyBusiness?: string | null;
  roleSummary?: string | null;
  companyCulture?: string | null;
  idempotencyKey?: string;
}

export interface ApplicationUpdateInput {
  jdId: string | null;
  resumeId: string | null;
  companyName: string;
  roleName: string;
  deliveryMethod: ApplicationDeliveryMethod;
  targetUrl: string | null;
  appliedAt: string | null;
  pendingConfirmation: boolean;
  companyBusiness: string | null;
  roleSummary: string | null;
  companyCulture: string | null;
  rejectionReason: string | null;
}

export interface ApplicationTransitionInput {
  toStatus: ApplicationStatus;
  occurredAt?: string | null;
  reason?: string | null;
}

export interface ApplicationListOptions {
  status?: ApplicationStatus;
  query?: string;
  cursor?: string;
  limit?: number;
}

export interface ApplicationListResult {
  items: ApplicationRecord[];
  nextCursor: string | null;
}

export interface ApplicationReferenceOption {
  id: string;
  title: string;
}

export interface ApplicationReferenceOptions {
  jds: ApplicationReferenceOption[];
  resumes: ApplicationReferenceOption[];
}

export interface ApplicationTombstone {
  id: string;
  entityVersion: number;
  deletedAt: string;
  syncStatus: TrackerSyncStatus;
}

export interface ApplicationStatusEvent {
  id: string;
  applicationId: string;
  fromStatus: ApplicationStatus | null;
  toStatus: ApplicationStatus;
  reason: string | null;
  occurredAt: string;
  operationId: string;
  createdAt: string;
}

export interface InterviewRound {
  id: string;
  applicationId: string;
  roundNumber: number;
  interviewType: "phone" | "video" | "onsite" | "hr" | "technical" | "case" | "other";
  scheduledAt: string | null;
  timezone: string;
  durationMinutes: number | null;
  locationOrLink: string | null;
  interviewer: string | null;
  status: "scheduled" | "completed" | "canceled";
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface ApplicationNote {
  id: string;
  applicationId: string;
  interviewRoundId: string | null;
  noteType: "general" | "interview" | "follow_up" | "company";
  content: string;
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Reminder {
  id: string;
  applicationId: string;
  interviewRoundId: string | null;
  title: string;
  remindAt: string;
  status: "scheduled" | "delivered" | "dismissed" | "canceled";
  deliveredAt: string | null;
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

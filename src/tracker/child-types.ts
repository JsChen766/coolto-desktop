import type { TrackerSyncStatus } from "./types.js";

export type InterviewType =
  | "phone" | "video" | "onsite" | "hr" | "technical" | "case" | "other";
export type InterviewStatus = "scheduled" | "completed" | "canceled";
export type NoteType = "general" | "interview" | "follow_up" | "company";
export type ReminderStatus = "scheduled" | "delivered" | "dismissed" | "canceled";

interface TrackerChildBase {
  id: string;
  applicationId: string;
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: TrackerSyncStatus;
}

export interface ApplicationStatusEvent {
  id: string;
  applicationId: string;
  fromStatus: import("./types.js").ApplicationStatus | null;
  toStatus: import("./types.js").ApplicationStatus;
  reason: string | null;
  occurredAt: string;
  operationId: string;
  createdAt: string;
}

export interface InterviewRound extends TrackerChildBase {
  roundNumber: number;
  interviewType: InterviewType;
  scheduledAt: string | null;
  timezone: string;
  durationMinutes: number | null;
  locationOrLink: string | null;
  interviewer: string | null;
  status: InterviewStatus;
}

export interface InterviewInput {
  roundNumber: number;
  interviewType: InterviewType;
  scheduledAt?: string | null;
  timezone: string;
  durationMinutes?: number | null;
  locationOrLink?: string | null;
  interviewer?: string | null;
  status: InterviewStatus;
}

export interface ApplicationNote extends TrackerChildBase {
  interviewRoundId: string | null;
  noteType: NoteType;
  content: string;
}

export interface NoteInput {
  interviewRoundId?: string | null;
  noteType: NoteType;
  content: string;
}

export interface Reminder extends TrackerChildBase {
  interviewRoundId: string | null;
  title: string;
  remindAt: string;
  status: ReminderStatus;
  deliveredAt: string | null;
}

export interface ReminderInput {
  interviewRoundId?: string | null;
  title: string;
  remindAt: string;
  status: ReminderStatus;
  deliveredAt?: string | null;
}

export type TrackerChildKind = "interview" | "note" | "reminder";
export type TrackerMutationKind = "create" | "update" | "delete";
export type TrackerChildRecord = InterviewRound | ApplicationNote | Reminder;

export interface TrackerChildProposal<T extends TrackerChildRecord = TrackerChildRecord> {
  id: string;
  entityKind: TrackerChildKind;
  mutation: TrackerMutationKind;
  applicationId: string;
  current: T | null;
  next: T | null;
  preparedAt: string;
}

export interface TrackerChildTombstone {
  id: string;
  entityVersion: number;
  deletedAt: string;
  syncStatus: TrackerSyncStatus;
}

export interface ApplicationTrackerDetail {
  statusEvents: ApplicationStatusEvent[];
  interviews: InterviewRound[];
  notes: ApplicationNote[];
  reminders: Reminder[];
}

export interface TrackerSyncIssueSummary {
  entityType: "application" | "interview_round" | "application_note" | "reminder";
  entityId: string;
  applicationId: string | null;
  status: "conflict" | "failed";
  errorCode: string;
  serverDeleted: boolean;
  canReapply: boolean;
}

export interface TrackerRecoveryProposal {
  id: string;
  issue: TrackerSyncIssueSummary;
  action: "accept_server" | "reapply";
  preparedAt: string;
}

export type SyncEntityType =
  | "user_profile"
  | "experience"
  | "job_description"
  | "resume"
  | "application"
  | "application_status_event"
  | "interview_round"
  | "application_note"
  | "reminder"
  | "user_preference";

export type SyncAction = "create" | "update" | "delete" | "transition";

export interface SyncChange {
  entityType: SyncEntityType;
  entityId: string;
  entityVersion: number;
  operation: "upsert" | "delete";
  changedAt: string;
  payload: Record<string, unknown>;
}

export interface SyncPage {
  changes: SyncChange[];
  nextCursor: string;
  hasMore: boolean;
  serverTime: string;
}

export interface LocalSyncState {
  mode: "bootstrap" | "pull";
  cursor: string;
}

export interface OutboxOperation {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  expectedVersion: number | null;
  payload: Record<string, unknown>;
  attemptCount: number;
}

export interface SyncPushOperation {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  expectedVersion: number | null;
  payload: Record<string, unknown>;
}

export type SyncOperationStatus =
  | "applied"
  | "already_applied"
  | "conflict"
  | "validation_failed"
  | "forbidden"
  | "retryable_error";

export interface SyncOperationResult {
  operationId: string;
  status: SyncOperationStatus;
  entityId: string;
  appliedVersion: number | null;
  errorCode?: string | null;
  serverEntity?: Record<string, unknown> | null;
}

export interface SyncPushResult {
  results: SyncOperationResult[];
  serverTime: string;
}

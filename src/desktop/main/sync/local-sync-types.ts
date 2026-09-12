import type {
  OutboxOperation,
  SyncAction,
  SyncEntityType,
} from "../../../sync/types.js";

export interface EnqueueMutation {
  operationId: string;
  entityType: SyncEntityType;
  entityId: string;
  action: SyncAction;
  expectedVersion: number | null;
  payload: Record<string, unknown>;
  localPayload?: Record<string, unknown>;
  createdAt?: string;
}
export interface LocalPayloadMerger {
  (
    entityType: SyncEntityType,
    currentPayload: Record<string, unknown> | undefined,
    serverPayload: Record<string, unknown>,
  ): Record<string, unknown>;
  clear?(): void;
}

export interface LocalEntity {
  entityType: SyncEntityType;
  entityId: string;
  entityVersion: number;
  localVersion: number;
  syncStatus: "clean" | "pending" | "conflict" | "failed";
  operation: "upsert" | "delete";
  changedAt: string;
  payload: Record<string, unknown>;
  lastServerOperation?: "upsert" | "delete" | null;
  lastServerPayload?: Record<string, unknown> | null;
  lastErrorCode?: string | null;
}

export interface SyncIssue {
  entityType: SyncEntityType;
  entityId: string;
  status: "conflict" | "failed";
  action: SyncAction;
  serverVersion: number;
  serverOperation: "upsert" | "delete" | null;
  localPayload: Record<string, unknown>;
  serverPayload: Record<string, unknown> | null;
  errorCode: string;
}

export interface PendingOperation extends OutboxOperation {
  createdAt: string;
  nextAttemptAt: string;
}

export interface OutboxRow {
  operation_id: string;
  entity_type: SyncEntityType;
  entity_id: string;
  action: SyncAction;
  expected_version: number | null;
  payload: Uint8Array;
  created_at: string;
  attempt_count: number;
  next_attempt_at: string;
  status?: "pending" | "conflict" | "failed";
  last_error_code?: string | null;
}

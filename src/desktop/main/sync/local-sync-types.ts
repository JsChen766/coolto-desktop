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

export interface LocalEntity {
  entityType: SyncEntityType;
  entityId: string;
  entityVersion: number;
  localVersion: number;
  syncStatus: "clean" | "pending" | "conflict";
  operation: "upsert" | "delete";
  changedAt: string;
  payload: Record<string, unknown>;
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
}

import type {
  SyncChange,
  SyncEntityType,
  SyncOperationResult,
  SyncOperationStatus,
  SyncPage,
  SyncPushResult,
} from "../sync/types.js";
import {
  ApiContractError,
  arrayValue,
  nullableNumber,
  nullableString,
  objectValue,
  requiredString,
} from "./contract-values.js";

const ENTITY_TYPES = new Set<SyncEntityType>([
  "user_profile",
  "experience",
  "job_description",
  "resume",
  "application",
  "application_status_event",
  "interview_round",
  "application_note",
  "reminder",
  "user_preference",
]);

const RESULT_STATUSES = new Set<SyncOperationStatus>([
  "applied",
  "already_applied",
  "conflict",
  "validation_failed",
  "forbidden",
  "retryable_error",
]);

export function normalizeSyncPage(value: unknown): SyncPage {
  const record = objectValue(value, "sync page");
  return {
    changes: arrayValue(record.changes, "syncPage.changes").map(normalizeChange),
    nextCursor: requiredString(record.nextCursor, "syncPage.nextCursor"),
    hasMore: booleanValue(record.hasMore, "syncPage.hasMore"),
    serverTime: requiredString(record.serverTime, "syncPage.serverTime"),
  };
}

export function normalizeSyncPushResult(value: unknown): SyncPushResult {
  const record = objectValue(value, "sync push result");
  return {
    results: arrayValue(record.results, "syncPush.results").map(normalizeResult),
    serverTime: requiredString(record.serverTime, "syncPush.serverTime"),
  };
}

function normalizeChange(value: unknown): SyncChange {
  const record = objectValue(value, "sync change");
  const entityType = syncEntityType(record.entityType, "syncChange.entityType");
  const operation = requiredString(record.operation, "syncChange.operation");
  if (operation !== "upsert" && operation !== "delete") {
    throw new ApiContractError("syncChange.operation is unsupported");
  }
  return {
    entityType,
    entityId: requiredString(record.entityId, "syncChange.entityId"),
    entityVersion: positiveInteger(
      record.entityVersion,
      "syncChange.entityVersion",
    ),
    operation,
    changedAt: requiredString(record.changedAt, "syncChange.changedAt"),
    payload: objectValue(record.payload, "syncChange.payload"),
  };
}

function normalizeResult(value: unknown): SyncOperationResult {
  const record = objectValue(value, "sync operation result");
  const status = requiredString(record.status, "syncResult.status");
  if (!RESULT_STATUSES.has(status as SyncOperationStatus)) {
    throw new ApiContractError("syncResult.status is unsupported");
  }
  const appliedVersion = nullableNumber(
    record.appliedVersion,
    "syncResult.appliedVersion",
  );
  if (
    appliedVersion !== null &&
    (!Number.isSafeInteger(appliedVersion) || appliedVersion < 1)
  ) {
    throw new ApiContractError("syncResult.appliedVersion is invalid");
  }
  const serverEntity =
    record.serverEntity === null || record.serverEntity === undefined
      ? null
      : objectValue(record.serverEntity, "syncResult.serverEntity");
  return {
    operationId: requiredString(record.operationId, "syncResult.operationId"),
    status: status as SyncOperationStatus,
    entityId: requiredString(record.entityId, "syncResult.entityId"),
    appliedVersion,
    errorCode:
      record.errorCode === undefined
        ? null
        : nullableString(record.errorCode, "syncResult.errorCode"),
    serverEntity,
  };
}

function syncEntityType(value: unknown, path: string): SyncEntityType {
  const entityType = requiredString(value, path);
  if (!ENTITY_TYPES.has(entityType as SyncEntityType)) {
    throw new ApiContractError(`${path} is unsupported`);
  }
  return entityType as SyncEntityType;
}

function positiveInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ApiContractError(`${path} must be a positive safe integer`);
  }
  return value as number;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new ApiContractError(`${path} must be a boolean`);
  }
  return value;
}

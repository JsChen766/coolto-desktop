import type { SyncEntityType } from "../../../sync/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";

export function previewEntity(
  entityType: SyncEntityType,
  id: string,
  payload: Record<string, unknown>,
  now: string,
): LocalEntity {
  return {
    entityType, entityId: id, entityVersion: 0, localVersion: 1,
    syncStatus: "pending", operation: "upsert", changedAt: now, payload,
    lastServerOperation: null, lastServerPayload: null, lastErrorCode: null,
  };
}

export function assertUnchanged(
  expected: { id: string; entityVersion: number; updatedAt: string },
  actual: { id: string; entityVersion: number; updatedAt: string },
): void {
  if (
    expected.id !== actual.id ||
    expected.entityVersion !== actual.entityVersion ||
    expected.updatedAt !== actual.updatedAt
  ) throw new Error("记录已发生变化，请重新检查后确认");
}


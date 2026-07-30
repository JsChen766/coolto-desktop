import type { SyncEntityType } from "../../../sync/types.js";
import type { TrackerChildTombstone } from "../../../tracker/child-types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { LocalSyncStore } from "../sync/local-sync-store.js";

export type TrackerStorage = Pick<
  LocalSyncStore,
  "getEntity" | "listEntities" | "enqueue"
>;

export function requireActive(
  store: TrackerStorage,
  entityType: SyncEntityType,
  id: string,
  label: string,
): LocalEntity {
  const normalized = id.trim();
  const entity = normalized ? store.getEntity(entityType, normalized) : undefined;
  if (!entity || entity.operation === "delete") throw new Error(`${label}不存在`);
  if (entity.syncStatus === "conflict" || entity.syncStatus === "failed") {
    throw new Error(`请先解决${label}同步问题`);
  }
  return entity;
}

export function requireApplication(store: TrackerStorage, applicationId: string): void {
  requireActive(store, "application", applicationId, "投递记录");
}

export function requireInterviewLink(
  store: TrackerStorage,
  applicationId: string,
  interviewId: string | null | undefined,
): void {
  if (!interviewId) return;
  const entity = requireActive(store, "interview_round", interviewId, "关联面试");
  if (entity.payload.applicationId !== applicationId) throw new Error("关联面试不属于当前投递");
}

export function tombstone(entity: LocalEntity): TrackerChildTombstone {
  if (entity.operation !== "delete") throw new Error("Tracker 子实体不是墓碑");
  return {
    id: entity.entityId,
    entityVersion: Math.max(1, entity.entityVersion),
    deletedAt: entity.changedAt,
    syncStatus: entity.syncStatus,
  };
}


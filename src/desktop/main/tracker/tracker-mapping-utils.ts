import type { TrackerSyncStatus } from "../../../tracker/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";

export interface ChildBase {
  id: string;
  applicationId: string;
  entityVersion: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: TrackerSyncStatus;
}

export function childBase(entity: LocalEntity): ChildBase {
  return {
    id: requiredString(entity.payload.id, "id"),
    applicationId: requiredString(entity.payload.applicationId, "applicationId"),
    entityVersion: Math.max(1, entity.entityVersion),
    createdAt: dateString(entity.payload.createdAt, "createdAt"),
    updatedAt: dateString(entity.payload.updatedAt, "updatedAt"),
    deletedAt: entity.operation === "delete" ? entity.changedAt : null,
    syncStatus: entity.syncStatus,
  };
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Malformed ${label}`);
  return value;
}

export function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Malformed ${label}`);
  return value;
}

export function dateString(value: unknown, label: string): string {
  const result = requiredString(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error(`Malformed ${label}`);
  return result;
}

export function nullableDate(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : dateString(value, label);
}

export function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isInteger(value) || Number(value) < minimum) throw new Error(`Malformed ${label}`);
  return Number(value);
}

export function nullableInteger(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : integer(value, label, 1);
}

export function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new Error(`Malformed ${label}`);
  }
  return value as T;
}

export function activeChildren(
  entities: LocalEntity[],
  applicationId?: string,
): LocalEntity[] {
  return entities.filter((entity) => entity.operation !== "delete" && (
    !applicationId || entity.payload.applicationId === applicationId
  ));
}


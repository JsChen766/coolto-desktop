import type { SyncEntityType } from "../../../sync/types.js";

const LOCAL_ONLY_KEYS: Partial<Record<SyncEntityType, readonly string[]>> = {
  experience: ["resumeSectionKey", "resumeSectionLabel"],
};

/** Keep only fields understood by the app but not persisted by the sync API. */
export function mergeLocalOnlyProjection(
  entityType: SyncEntityType,
  local: Record<string, unknown> | undefined,
  remote: Record<string, unknown>,
): Record<string, unknown> {
  if (!local) return remote;
  const merged = { ...remote };
  for (const key of LOCAL_ONLY_KEYS[entityType] ?? []) {
    if (key in local) merged[key] = local[key];
  }
  return merged;
}

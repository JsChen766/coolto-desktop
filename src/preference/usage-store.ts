import type { PreferenceUsageRecordV1 } from "./types.js";

export function recordPreferenceUsage(
  records: readonly PreferenceUsageRecordV1[],
  ownerId: string,
  preferenceId: string,
  now: string,
): PreferenceUsageRecordV1[] {
  const next = records.map((record) => ({ ...record }));
  const existing = next.find((record) =>
    record.ownerId === ownerId && record.preferenceId === preferenceId,
  );
  if (existing) {
    existing.useCount += 1;
    existing.lastUsedAt = now;
    return next;
  }
  next.push({ ownerId, preferenceId, useCount: 1, lastUsedAt: now });
  return next;
}

export function preferenceUsageFor(
  records: readonly PreferenceUsageRecordV1[],
  ownerId: string,
  preferenceId: string,
): PreferenceUsageRecordV1 | null {
  const value = records.find((record) =>
    record.ownerId === ownerId && record.preferenceId === preferenceId,
  );
  return value ? { ...value } : null;
}

export function preferenceUsageLabel(
  usage: PreferenceUsageRecordV1 | null,
): string {
  if (!usage || usage.useCount < 1 || !usage.lastUsedAt) return "本机尚未使用";
  return `本机最近使用 · ${usage.useCount} 次 · ${usage.lastUsedAt}`;
}

import type { ProfileContactUpdate } from "../../../profile/types.js";

const FIELDS = [
  "fullName", "contactEmail", "phone", "location", "linkedinUrl", "githubUrl", "personalWebsite",
] as const;

export function profileChanges(value: unknown): ProfileContactUpdate {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("个人资料修改无效");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!FIELDS.includes(key as typeof FIELDS[number])) {
    throw new Error(`个人资料包含未知字段：${key}`);
  }
  const changes: ProfileContactUpdate = {};
  for (const key of FIELDS) {
    const field = record[key];
    if (field === undefined) continue;
    if (field !== null && typeof field !== "string") throw new Error(`个人资料字段 ${key} 无效`);
    changes[key] = field;
  }
  if (!Object.keys(changes).length) throw new Error("至少修改一个个人资料字段");
  return changes;
}

export function proposalId(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("profile-") || value.length > 100) {
    throw new Error("个人资料 proposalId 无效");
  }
  return value;
}

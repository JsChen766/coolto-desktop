import type { ProfileChangeSet } from "../../../profile/types.js";
import { normalizeCareerProfileChangeSet } from "../../../profile/career-targets.js";

const CONTACT_FIELDS = [
  "fullName", "contactEmail", "phone", "location",
  "linkedinUrl", "githubUrl", "personalWebsite",
] as const;
const CAREER_FIELDS = [
  "currentTitle", "currentCompany", "yearsOfExperience", "careerStage",
  "careerTargets", "preferredLanguage", "resumeStyle",
] as const;

export function profileChanges(value: unknown): ProfileChangeSet {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("个人资料修改无效");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set<string>([...CONTACT_FIELDS, ...CAREER_FIELDS]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) throw new Error(`个人资料包含未知字段：${key}`);
  }
  const changes: ProfileChangeSet = {};
  for (const key of CONTACT_FIELDS) {
    const field = record[key];
    if (field === undefined) continue;
    if (field !== null && typeof field !== "string") {
      throw new Error(`个人资料字段 ${key} 无效`);
    }
    changes[key] = field;
  }
  const careerInput = Object.fromEntries(
    CAREER_FIELDS.filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
  if (Object.keys(careerInput).length) {
    Object.assign(changes, normalizeCareerProfileChangeSet(careerInput));
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

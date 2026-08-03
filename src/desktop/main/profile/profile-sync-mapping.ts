import type { UserProfile } from "../../../api/types.js";
import {
  normalizeResumeContact,
  type ResumeContactFields,
} from "../../../resume/contracts/profile-contact.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
import type { ProfileContactUpdate } from "../../../profile/types.js";

const CONTACT_KEYS = [
  "fullName", "contactEmail", "phone", "location", "linkedinUrl", "githubUrl", "personalWebsite",
] as const;

export function toUserProfile(entity: LocalEntity): UserProfile {
  const payload = entity.payload;
  return {
    fullName: nullable(payload.fullName), contactEmail: nullable(payload.contactEmail), email: null,
    phone: nullable(payload.phone), location: nullable(payload.location),
    linkedinUrl: nullable(payload.linkedinUrl), githubUrl: nullable(payload.githubUrl),
    personalWebsite: nullable(payload.personalWebsite), currentTitle: nullable(payload.currentTitle),
    currentCompany: nullable(payload.currentCompany), yearsOfExperience: nullableNumber(payload.yearsOfExperience),
    careerStage: nullable(payload.careerStage), targetRoles: strings(payload.targetRoles),
    targetIndustries: strings(payload.targetIndustries), targetLocations: strings(payload.targetLocations),
    preferredLanguage: nullable(payload.preferredLanguage), resumeStyle: nullable(payload.resumeStyle),
  };
}

export function contactOf(profile: UserProfile): ResumeContactFields {
  return {
    fullName: profile.fullName, contactEmail: profile.contactEmail, phone: profile.phone,
    location: profile.location, linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl,
    personalWebsite: profile.personalWebsite,
  };
}

export function mergeContact(
  current: UserProfile,
  changes: ProfileContactUpdate,
): UserProfile {
  const next = structuredClone(current);
  const normalized = normalizeResumeContact({ ...contactOf(current), ...changes });
  for (const key of CONTACT_KEYS) next[key] = normalized[key];
  return next;
}

export function toProfileWritePayload(profile: UserProfile): Record<string, unknown> {
  return {
    fullName: profile.fullName, contactEmail: profile.contactEmail, phone: profile.phone,
    location: profile.location, linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl,
    personalWebsite: profile.personalWebsite, currentTitle: profile.currentTitle,
    currentCompany: profile.currentCompany, yearsOfExperience: profile.yearsOfExperience,
    careerStage: profile.careerStage, targetRoles: profile.targetRoles,
    targetIndustries: profile.targetIndustries, targetLocations: profile.targetLocations,
    preferredLanguage: profile.preferredLanguage ?? "zh-CN", resumeStyle: profile.resumeStyle,
  };
}

function nullable(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error("Profile 同步投影字段无效");
}

function nullableNumber(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  throw new Error("Profile 同步投影字段无效");
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Profile 同步投影字段无效");
  }
  return [...value];
}

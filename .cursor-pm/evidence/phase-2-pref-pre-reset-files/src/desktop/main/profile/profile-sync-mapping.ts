import type { UserProfile } from "../../../api/types.js";
import {
  careerTargetFingerprint,
  legacyToCareerTargets,
  normalizeCareerProfileChangeSet,
  normalizeCareerTarget,
  normalizeCareerTargets,
  targetsToLegacy,
  type CareerTargetV1,
} from "../../../profile/career-targets.js";
import {
  normalizeResumeContact,
  type ResumeContactFields,
} from "../../../resume/contracts/profile-contact.js";
import {
  isProfileCareerStage,
  isProfileLanguage,
  isProfileResumeStyle,
} from "../../../profile/profile-defaults.js";
import type { ProfileChangeSet, ProfileContactUpdate } from "../../../profile/types.js";
import type { LocalEntity } from "../sync/local-sync-types.js";
const CONTACT_KEYS = [
  "fullName", "contactEmail", "phone", "location", "linkedinUrl", "githubUrl", "personalWebsite",
] as const;
const CAREER_KEYS = [
  "currentTitle", "currentCompany", "yearsOfExperience", "careerStage",
  "careerTargets", "preferredLanguage", "resumeStyle",
] as const;
export function toUserProfile(entity: LocalEntity): UserProfile {
  const payload = entity.payload;
  const careerTargets = readCareerTargets(payload);
  const legacy = targetsToLegacy(careerTargets);
  return {
    fullName: nullable(payload.fullName), contactEmail: nullableLegacy(payload.contactEmail), email: null,
    phone: nullable(payload.phone), location: nullable(payload.location),
    linkedinUrl: nullable(payload.linkedinUrl), githubUrl: nullable(payload.githubUrl),
    personalWebsite: nullable(payload.personalWebsite), currentTitle: nullable(payload.currentTitle),
    currentCompany: nullable(payload.currentCompany), yearsOfExperience: nullableNumber(payload.yearsOfExperience),
    careerStage: normalizeCareerStage(payload.careerStage), ...legacy, careerTargets,
    preferredLanguage: nullable(payload.preferredLanguage), resumeStyle: nullable(payload.resumeStyle),
    entityVersion: entity.entityVersion, updatedAt: entity.changedAt,
  };
}

export function contactOf(profile: UserProfile): ResumeContactFields {
  return {
    fullName: profile.fullName, contactEmail: profile.contactEmail, phone: profile.phone,
    location: profile.location, linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl,
    personalWebsite: profile.personalWebsite,
  };
}

export function mergeProfile(current: UserProfile, changes: ProfileChangeSet): UserProfile {
  const next = structuredClone(current);
  const normalizedCareer = normalizeCareerChanges(changes);
  const contactChanges: ProfileContactUpdate = {};
  for (const key of CONTACT_KEYS) {
    const value = changes[key];
    if (Object.prototype.hasOwnProperty.call(changes, key) && value !== undefined) {
      contactChanges[key] = value;
    }
  }
  if (Object.keys(contactChanges).length) {
    const normalized = normalizeResumeContact({ ...contactOf(current), ...contactChanges });
    for (const key of CONTACT_KEYS) next[key] = normalized[key];
  }
  if (Object.prototype.hasOwnProperty.call(normalizedCareer, "currentTitle")) {
    next.currentTitle = normalizedCareer.currentTitle ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedCareer, "currentCompany")) {
    next.currentCompany = normalizedCareer.currentCompany ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedCareer, "yearsOfExperience")) {
    next.yearsOfExperience = normalizedCareer.yearsOfExperience ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedCareer, "careerStage")) {
    next.careerStage = normalizedCareer.careerStage ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedCareer, "careerTargets")) {
    next.careerTargets = normalizedCareer.careerTargets ?? [];
    Object.assign(next, targetsToLegacy(next.careerTargets));
  }
  if (Object.prototype.hasOwnProperty.call(normalizedCareer, "preferredLanguage")) {
    next.preferredLanguage = normalizedCareer.preferredLanguage!;
  }
  if (Object.prototype.hasOwnProperty.call(normalizedCareer, "resumeStyle")) {
    next.resumeStyle = normalizedCareer.resumeStyle ?? null;
  }
  return next;
}

export function toProfileWritePayload(profile: UserProfile): Record<string, unknown> {
  const careerTargets = readCareerTargets({
    careerTargets: profile.careerTargets,
    targetRoles: profile.targetRoles,
    targetIndustries: profile.targetIndustries,
    targetLocations: profile.targetLocations,
  });
  const legacy = targetsToLegacy(careerTargets);
  const payload: Record<string, unknown> = {
    fullName: profile.fullName, contactEmail: profile.contactEmail, phone: profile.phone,
    location: profile.location, linkedinUrl: profile.linkedinUrl, githubUrl: profile.githubUrl,
    personalWebsite: profile.personalWebsite, currentTitle: profile.currentTitle,
    currentCompany: profile.currentCompany, yearsOfExperience: profile.yearsOfExperience,
    ...legacy,
    careerTargets: careerTargets.map(({ role, industries, locations, isPrimary }) => ({
      role, industries, locations, isPrimary,
    })),
  };
  if (profile.careerStage === null || isProfileCareerStage(profile.careerStage ?? "")) {
    payload.careerStage = profile.careerStage === "career_change" ? "career_switcher" : profile.careerStage;
  }
  if (profile.preferredLanguage === null || isProfileLanguage(profile.preferredLanguage ?? "")) {
    payload.preferredLanguage = profile.preferredLanguage ?? "zh-CN";
  }
  if (profile.resumeStyle === null || isProfileResumeStyle(profile.resumeStyle ?? "")) {
    payload.resumeStyle = profile.resumeStyle;
  }
  return payload;
}

export function toProfileLocalPayload(profile: UserProfile): Record<string, unknown> {
  const payload = toProfileWritePayload(profile);
  const careerTargets = readCareerTargets({
    careerTargets: profile.careerTargets,
    targetRoles: profile.targetRoles,
    targetIndustries: profile.targetIndustries,
    targetLocations: profile.targetLocations,
  });
  payload.careerTargets = careerTargets.map((target) => ({
    ...target, industries: [...target.industries], locations: [...target.locations],
  }));
  return payload;
}

function normalizeCareerChanges(changes: ProfileChangeSet): ProfileChangeSet {
  const input = Object.fromEntries(
    CAREER_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(changes, key))
      .map((key) => [key, changes[key]]),
  );
  return Object.keys(input).length ? normalizeCareerProfileChangeSet(input) : {};
}

function readCareerTargets(payload: Record<string, unknown>): CareerTargetV1[] {
  if (payload.careerTargets === undefined) {
    return legacyToCareerTargets({
      targetRoles: payload.targetRoles === undefined ? [] : payload.targetRoles,
      targetIndustries: payload.targetIndustries === undefined ? [] : payload.targetIndustries,
      targetLocations: payload.targetLocations === undefined ? [] : payload.targetLocations,
    });
  }
  if (!Array.isArray(payload.careerTargets)) throw new Error("Profile careerTargets 投影无效");
  const targets = payload.careerTargets.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Profile careerTargets[${index}] 投影无效`);
    }
    const item = value as Record<string, unknown>;
    const role = item.role === undefined ? null : item.role;
    const industries = item.industries ?? [];
    const locations = item.locations ?? [];
    if ((role !== null && typeof role !== "string") ||
        !Array.isArray(industries) || industries.some((entry) => typeof entry !== "string") ||
        !Array.isArray(locations) || locations.some((entry) => typeof entry !== "string")) {
      throw new Error(`Profile careerTargets[${index}] 投影无效`);
    }
    const identity = {
      role: role as string | null,
      industries: industries as string[],
      locations: locations as string[],
    };
    const hasId = typeof item.id === "string";
    return normalizeCareerTarget({
      ...identity,
      id: hasId ? item.id : `legacy:${careerTargetFingerprint(identity)}`,
      idKind: item.idKind ?? (hasId ? "opaque" : "legacy_compatibility"),
      isPrimary: item.isPrimary,
    }, `Profile careerTargets[${index}]`);
  });
  const normalized = normalizeCareerTargets(targets);
  if (["targetRoles", "targetIndustries", "targetLocations"]
    .some((key) => Object.prototype.hasOwnProperty.call(payload, key))) {
    const supplied = {
      targetRoles: strings(payload.targetRoles === undefined ? [] : payload.targetRoles),
      targetIndustries: strings(payload.targetIndustries === undefined ? [] : payload.targetIndustries),
      targetLocations: strings(payload.targetLocations === undefined ? [] : payload.targetLocations),
    };
    if (JSON.stringify(targetsToLegacy(normalized)) !== JSON.stringify(supplied)) {
      throw new Error("Profile careerTargets 与 legacy targets 不一致");
    }
  }
  return normalized;
}

function nullable(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  throw new Error("Profile 同步投影字段无效");
}

function nullableLegacy(value: unknown): string | null {
  return value === undefined ? null : nullable(value);
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

function normalizeCareerStage(value: unknown): string | null {
  const stage = nullable(value);
  return stage === "career_switcher" ? "career_change" : stage;
}
import type {
  JdRecord,
  JdRequirement,
  JdSearchResult,
  UserProfile,
} from "./types.js";
import { JD_SOURCE_KINDS, type JdSourceKind } from "../jd/source.js";
import {
  ApiContractError,
  arrayValue,
  nullableNumber,
  nullableString,
  requiredPositiveInteger,
  objectValue,
  requiredString,
  stringArray,
} from "./contract-values.js";
import {
  careerTargetFingerprint,
  legacyToCareerTargets,
  normalizeCareerTarget,
  normalizeCareerTargets,
  targetsToLegacy,
  type CareerTargetV1,
} from "../profile/career-targets.js";

export { ApiContractError } from "./contract-values.js";
export function normalizeUserProfile(value: unknown): UserProfile {
  const record = objectValue(value, "user profile");
  const careerTargets = normalizeCareerTargetsRecord(record);
  const legacy = targetsToLegacy(careerTargets);
  const careerStage = nullableString(record.careerStage, "profile.careerStage");
  const profile: UserProfile = {
    fullName: nullableString(record.fullName, "profile.fullName"),
    contactEmail: nullableString(record.contactEmail, "profile.contactEmail"),
    email: nullableString(record.email, "profile.email"),
    phone: nullableString(record.phone, "profile.phone"),
    location: nullableString(record.location, "profile.location"),
    linkedinUrl: nullableString(record.linkedinUrl, "profile.linkedinUrl"),
    githubUrl: nullableString(record.githubUrl, "profile.githubUrl"),
    personalWebsite: nullableString(record.personalWebsite, "profile.personalWebsite"),
    currentTitle: nullableString(record.currentTitle, "profile.currentTitle"),
    currentCompany: nullableString(record.currentCompany, "profile.currentCompany"),
    yearsOfExperience: nullableNumber(record.yearsOfExperience, "profile.yearsOfExperience"),
    careerStage: careerStage === "career_switcher" ? "career_change" : careerStage,
    ...legacy, careerTargets,
    preferredLanguage: nullableString(record.preferredLanguage, "profile.preferredLanguage"),
    resumeStyle: nullableString(record.resumeStyle, "profile.resumeStyle"),
  };
  if (record.entityVersion !== undefined) {
    profile.entityVersion = requiredPositiveInteger(record.entityVersion, "profile.entityVersion");
  }
  if (record.updatedAt !== undefined) {
    profile.updatedAt = requiredString(record.updatedAt, "profile.updatedAt");
  }
  return profile;
}


export function normalizeJdRecord(value: unknown): JdRecord {
  const record = objectValue(value, "JD");
  const sourceKind = record.sourceKind === undefined
    ? "manual"
    : requiredString(record.sourceKind, "jd.sourceKind");
  if (!JD_SOURCE_KINDS.includes(sourceKind as JdSourceKind)) {
    throw new ApiContractError(`jd.sourceKind has unsupported value: ${sourceKind}`);
  }
  return {
    id: requiredString(record.id, "jd.id"),
    title: requiredString(record.title, "jd.title"),
    company: nullableString(record.company, "jd.company"),
    targetRole: nullableString(record.targetRole, "jd.targetRole"),
    sourceKind: sourceKind as JdSourceKind,
    sourceUrl: record.sourceUrl === undefined
      ? null
      : nullableString(record.sourceUrl, "jd.sourceUrl"),
    rawText: requiredString(record.rawText, "jd.rawText"),
    requirements: arrayValue(record.requirements, "jd.requirements").map(
      normalizeJdRequirement,
    ),
    jdHash: nullableString(record.jdHash, "jd.jdHash"),
    requirementMapId: nullableString(
      record.requirementMapId,
      "jd.requirementMapId",
    ),
    requirementsOrigin: requiredString(
      record.requirementsOrigin,
      "jd.requirementsOrigin",
    ),
    sourceThreadId: nullableString(record.sourceThreadId, "jd.sourceThreadId"),
    createdAt: requiredString(record.createdAt, "jd.createdAt"),
    updatedAt: requiredString(record.updatedAt, "jd.updatedAt"),
    entityVersion: requiredPositiveInteger(record.entityVersion, "jd.entityVersion"),
    deletedAt: nullableString(record.deletedAt, "jd.deletedAt"),
  };
}

export function normalizeJdSearchResult(value: unknown): JdSearchResult {
  const record = objectValue(value, "JD search result");
  return {
    items: arrayValue(record.items, "jdSearch.items").map(normalizeJdRecord),
    nextCursor: nullableString(record.nextCursor, "jdSearch.nextCursor"),
  };
}

function normalizeJdRequirement(value: unknown): JdRequirement {
  const record = objectValue(value, "JD requirement");
  const importance = requiredString(record.importance, "requirement.importance");
  if (!(["low", "medium", "high"] as const).includes(importance as never)) {
    throw new ApiContractError(
      `requirement.importance has unsupported value: ${importance}`,
    );
  }
  const v2Importance = nullableString(
    record.v2Importance,
    "requirement.v2Importance",
  );
  if (
    v2Importance &&
    !(["must_have", "preferred", "optional"] as const).includes(
      v2Importance as never,
    )
  ) {
    throw new ApiContractError(
      `requirement.v2Importance has unsupported value: ${v2Importance}`,
    );
  }
  const weight = nullableNumber(record.weight, "requirement.weight");
  if (weight !== null && (weight < 0 || weight > 1)) {
    throw new ApiContractError("requirement.weight must be between 0 and 1");
  }
  return {
    id: requiredString(record.id, "requirement.id"),
    text: requiredString(record.text, "requirement.text"),
    category: requiredString(record.category, "requirement.category"),
    importance: importance as JdRequirement["importance"],
    keywords: stringArray(record.keywords, "requirement.keywords"),
    weight,
    v2Importance: v2Importance as JdRequirement["v2Importance"],
    v2Category: nullableString(record.v2Category, "requirement.v2Category"),
  };
}
function normalizeCareerTargetsRecord(
  record: Record<string, unknown>,
): CareerTargetV1[] {
  const raw = record.careerTargets === undefined
    ? legacyToCareerTargets({
        targetRoles: record.targetRoles === undefined
          ? [] : stringArray(record.targetRoles, "profile.targetRoles"),
        targetIndustries: record.targetIndustries === undefined
          ? [] : stringArray(record.targetIndustries, "profile.targetIndustries"),
        targetLocations: record.targetLocations === undefined
          ? [] : stringArray(record.targetLocations, "profile.targetLocations"),
      })
    : arrayValue(record.careerTargets, "profile.careerTargets").map(
        (value, index) => normalizeApiCareerTarget(value, index),
      );
  const normalized = normalizeCareerTargets(raw);
  if (hasTargetFields(record)) {
    const legacy = targetsToLegacy(normalized);
    const supplied = {
      targetRoles: stringArray(
        record.targetRoles === undefined ? [] : record.targetRoles,
        "profile.targetRoles",
      ),
      targetIndustries: stringArray(
        record.targetIndustries === undefined ? [] : record.targetIndustries,
        "profile.targetIndustries",
      ),
      targetLocations: stringArray(
        record.targetLocations === undefined ? [] : record.targetLocations,
        "profile.targetLocations",
      ),
    };
    if (JSON.stringify(legacy) !== JSON.stringify(supplied)) {
      throw new ApiContractError("profile careerTargets 与 legacy targets 不一致");
    }
  }
  return normalized;
}

function normalizeApiCareerTarget(
  value: unknown,
  index: number,
): CareerTargetV1 {
  const record = objectValue(value, `profile.careerTargets[${index}]`);
  const role = record.role === undefined ? null : record.role;
  const industries = record.industries === undefined ? [] : record.industries;
  const locations = record.locations === undefined ? [] : record.locations;
  if (
    (role !== null && typeof role !== "string") ||
    !Array.isArray(industries) ||
    industries.some((item) => typeof item !== "string") ||
    !Array.isArray(locations) ||
    locations.some((item) => typeof item !== "string")
  ) {
    throw new ApiContractError(`profile.careerTargets[${index}] 无效`);
  }
  const identity = {
    role: role as string | null,
    industries: industries as string[],
    locations: locations as string[],
  };
  const hasId = typeof record.id === "string";
  return normalizeCareerTarget({
    ...identity,
    id: hasId ? record.id : `legacy:${careerTargetFingerprint(identity)}`,
    idKind: record.idKind ?? (hasId ? "opaque" : "legacy_compatibility"),
    isPrimary: record.isPrimary,
  }, `profile.careerTargets[${index}]`);
}

function hasTargetFields(record: Record<string, unknown>): boolean {
  return ["targetRoles", "targetIndustries", "targetLocations"]
    .some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

import type {
  JdRecord,
  JdRequirement,
  JdSearchResult,
  UserProfile,
} from "./types.js";
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

export { ApiContractError } from "./contract-values.js";

export function normalizeUserProfile(value: unknown): UserProfile {
  const record = objectValue(value, "user profile");
  return {
    fullName: nullableString(record.fullName, "profile.fullName"),
    contactEmail: nullableString(record.contactEmail, "profile.contactEmail"),
    email: nullableString(record.email, "profile.email"),
    phone: nullableString(record.phone, "profile.phone"),
    location: nullableString(record.location, "profile.location"),
    linkedinUrl: nullableString(record.linkedinUrl, "profile.linkedinUrl"),
    githubUrl: nullableString(record.githubUrl, "profile.githubUrl"),
    personalWebsite: nullableString(
      record.personalWebsite,
      "profile.personalWebsite",
    ),
    currentTitle: nullableString(record.currentTitle, "profile.currentTitle"),
    currentCompany: nullableString(
      record.currentCompany,
      "profile.currentCompany",
    ),
    yearsOfExperience: nullableNumber(
      record.yearsOfExperience,
      "profile.yearsOfExperience",
    ),
    careerStage: nullableString(record.careerStage, "profile.careerStage"),
    targetRoles: stringArray(record.targetRoles, "profile.targetRoles"),
    targetIndustries: stringArray(
      record.targetIndustries,
      "profile.targetIndustries",
    ),
    targetLocations: stringArray(
      record.targetLocations,
      "profile.targetLocations",
    ),
    preferredLanguage: nullableString(
      record.preferredLanguage,
      "profile.preferredLanguage",
    ),
    resumeStyle: nullableString(record.resumeStyle, "profile.resumeStyle"),
  };
}

export function normalizeJdRecord(value: unknown): JdRecord {
  const record = objectValue(value, "JD");
  return {
    id: requiredString(record.id, "jd.id"),
    title: requiredString(record.title, "jd.title"),
    company: nullableString(record.company, "jd.company"),
    targetRole: nullableString(record.targetRole, "jd.targetRole"),
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

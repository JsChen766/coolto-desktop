import type {
  ExperienceCategory,
  ExperienceDetail,
  ExperienceRevision,
  ExperienceRevisionPage,
  ExperienceSearchResult,
  ExperienceSummary,
} from "./types.js";
import {
  ApiContractError,
  arrayValue,
  nullableString,
  objectValue,
  optionalObject,
  requiredPositiveInteger,
  requiredString,
  stringArray,
} from "./contract-values.js";

const EXPERIENCE_CATEGORIES = new Set<ExperienceCategory>([
  "work",
  "project",
  "education",
  "volunteer",
  "other",
]);

export function normalizeExperienceSearchResult(
  value: unknown,
): ExperienceSearchResult {
  const record = objectValue(value, "experience search result");
  return {
    items: arrayValue(record.items, "experienceSearch.items").map((item) =>
      normalizeExperienceSummary(item, "experienceSearch.items[]"),
    ),
    nextCursor: nullableString(
      record.nextCursor,
      "experienceSearch.nextCursor",
    ),
  };
}

export function normalizeExperienceDetail(value: unknown): ExperienceDetail {
  const record = objectValue(value, "experience detail");
  const summary = normalizeExperienceSummary(record, "experience");
  return {
    ...summary,
    revisions: arrayValue(record.revisions, "experience.revisions").map(
      (revision) => normalizeExperienceRevision(revision, "experience.revisions[]"),
    ),
  };
}

export function normalizeExperienceRevisionPage(
  value: unknown,
): ExperienceRevisionPage {
  const record = objectValue(value, "experience revision page");
  return {
    items: arrayValue(record.items, "experienceRevisions.items").map(
      (revision) => normalizeExperienceRevision(
        revision,
        "experienceRevisions.items[]",
      ),
    ),
    nextCursor: nullableString(
      record.nextCursor,
      "experienceRevisions.nextCursor",
    ),
  };
}

export function normalizeExperienceSummary(
  value: unknown,
  path = "experience",
): ExperienceSummary {
  const record = objectValue(value, path);
  const category = requiredString(record.category, `${path}.category`);
  if (!EXPERIENCE_CATEGORIES.has(category as ExperienceCategory)) {
    throw new ApiContractError(`${path}.category has unsupported value: ${category}`);
  }
  const status = requiredString(record.status, `${path}.status`);
  if (status !== "active" && status !== "archived") {
    throw new ApiContractError(`${path}.status has unsupported value: ${status}`);
  }
  const currentRevision = optionalObject(
    record.currentRevision,
    `${path}.currentRevision`,
  );
  return {
    id: requiredString(record.id, `${path}.id`),
    category: category as ExperienceCategory,
    title: requiredString(record.title, `${path}.title`),
    organization: nullableString(record.organization, `${path}.organization`),
    role: nullableString(record.role, `${path}.role`),
    location: nullableString(record.location, `${path}.location`),
    startDate: nullableString(record.startDate, `${path}.startDate`),
    endDate: nullableString(record.endDate, `${path}.endDate`),
    tags: stringArray(record.tags, `${path}.tags`),
    status,
    currentRevisionId: nullableString(
      record.currentRevisionId,
      `${path}.currentRevisionId`,
    ),
    ...(currentRevision
      ? {
          currentRevision: normalizeExperienceRevision(
            currentRevision,
            `${path}.currentRevision`,
          ),
        }
      : {}),
    createdAt: requiredString(record.createdAt, `${path}.createdAt`),
    updatedAt: requiredString(record.updatedAt, `${path}.updatedAt`),
    entityVersion: requiredPositiveInteger(record.entityVersion, `${path}.entityVersion`),
    deletedAt: nullableString(record.deletedAt, `${path}.deletedAt`),
  };
}

export function normalizeExperienceRevision(
  value: unknown,
  path: string,
): ExperienceRevision {
  const record = objectValue(value, path);
  return {
    id: requiredString(record.id, `${path}.id`),
    experienceId: requiredString(record.experienceId, `${path}.experienceId`),
    content: requiredString(record.content, `${path}.content`),
    source: requiredString(record.source, `${path}.source`),
    revisionHash: nullableString(record.revisionHash, `${path}.revisionHash`),
    factBankStatus: requiredString(
      record.factBankStatus,
      `${path}.factBankStatus`,
    ),
    createdAt: requiredString(record.createdAt, `${path}.createdAt`),
  };
}

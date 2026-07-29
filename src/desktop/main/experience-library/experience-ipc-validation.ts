import type {
  ExperienceCreateInput,
  ExperienceSearchOptions,
  ExperienceUpdateInput,
} from "../../../api/types.js";
import type { ExperiencePrepareUpdateRequest } from "../../../experience/maintenance-types.js";

const CATEGORIES = new Set(["work", "project", "education", "volunteer", "other"]);
const STATUSES = new Set(["active", "archived"]);
const UPDATE_KEYS = new Set([
  "category", "title", "content", "organization", "role", "location",
  "startDate", "endDate", "tags", "status",
]);

export function parseExperienceId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("experienceId 不能为空");
  }
  return value.trim();
}

export function parseProposalId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("proposalId 不能为空");
  }
  return value.trim();
}

export function parseExperienceSearch(
  value: unknown,
): ExperienceSearchOptions {
  if (value === undefined) return {};
  const record = object(value, "搜索参数");
  exactKeys(record, new Set(["q", "category", "tags", "status", "limit", "cursor"]));
  const result: ExperienceSearchOptions = {};
  if (record.q !== undefined) result.q = string(record.q, "q");
  if (record.cursor !== undefined) result.cursor = string(record.cursor, "cursor");
  if (record.category !== undefined) {
    const category = string(record.category, "category");
    if (!CATEGORIES.has(category)) throw new Error("category 不合法");
    result.category = category as NonNullable<ExperienceSearchOptions["category"]>;
  }
  if (record.status !== undefined) {
    const status = string(record.status, "status");
    if (!STATUSES.has(status)) throw new Error("status 不合法");
    result.status = status as NonNullable<ExperienceSearchOptions["status"]>;
  }
  if (record.tags !== undefined) result.tags = strings(record.tags, "tags");
  if (record.limit !== undefined) {
    if (!Number.isSafeInteger(record.limit) || (record.limit as number) < 1) {
      throw new Error("limit 不合法");
    }
    result.limit = Math.min(record.limit as number, 500);
  }
  return result;
}

export function parseExperienceCreate(value: unknown): ExperienceCreateInput {
  const record = object(value, "新建请求");
  exactKeys(record, new Set([
    "category", "title", "content", "organization", "role", "location",
    "startDate", "endDate", "tags",
  ]));
  const category = string(record.category, "category");
  if (!CATEGORIES.has(category)) throw new Error("category 不合法");
  const result: ExperienceCreateInput = {
    category: category as ExperienceCreateInput["category"],
    title: string(record.title, "title"),
    content: string(record.content, "content"),
  };
  for (const key of [
    "organization", "role", "location", "startDate", "endDate",
  ] as const) {
    if (record[key] !== undefined) result[key] = string(record[key], key);
  }
  if (record.tags !== undefined) result.tags = strings(record.tags, "tags");
  return result;
}

export function parseExperienceUpdate(
  value: unknown,
): ExperiencePrepareUpdateRequest {
  const record = object(value, "更新请求");
  exactKeys(record, new Set(["experienceId", "changes"]));
  const changes = object(record.changes, "changes");
  exactKeys(changes, UPDATE_KEYS);
  if (Object.keys(changes).length === 0) throw new Error("changes 不能为空");
  const result: ExperienceUpdateInput = {};
  if (changes.category !== undefined) {
    const category = string(changes.category, "category");
    if (!CATEGORIES.has(category)) throw new Error("category 不合法");
    result.category = category as NonNullable<ExperienceUpdateInput["category"]>;
  }
  if (changes.status !== undefined) {
    const status = string(changes.status, "status");
    if (!STATUSES.has(status)) throw new Error("status 不合法");
    result.status = status as NonNullable<ExperienceUpdateInput["status"]>;
  }
  for (const key of ["title", "content"] as const) {
    if (changes[key] !== undefined) result[key] = string(changes[key], key);
  }
  for (const key of [
    "organization", "role", "location", "startDate", "endDate",
  ] as const) {
    if (changes[key] !== undefined) {
      result[key] = nullableString(changes[key], key);
    }
  }
  if (changes.tags !== undefined) result.tags = strings(changes.tags, "tags");
  return { experienceId: parseExperienceId(record.experienceId), changes: result };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`不支持字段 ${unknown}`);
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} 必须是字符串`);
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} 必须是字符串数组`);
  }
  return [...value];
}

import type {
  PreferenceScopeKind,
  PreferenceSource,
} from "./types.js";

export const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const RFC3339_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/u;
export const PREFERENCE_SCOPE_KIND_SET: readonly PreferenceScopeKind[] = [
  "global", "resume", "job_search", "browser_fill", "interview",
];

export class PreferenceValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(message: string, issues: readonly string[] = [message]) {
    super(message);
    this.name = "PreferenceValidationError";
    this.issues = issues;
  }
}

export function normalizeDomain(value: unknown): string {
  if (typeof value !== "string") throw new PreferenceValidationError("browser_fill domain 必须是字符串");
  const domain = value.trim().toLowerCase();
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(domain)) {
    throw new PreferenceValidationError("browser_fill domain 必须是无 scheme、端口、路径的精确 host");
  }
  return domain;
}

export function normalizeFingerprint(value: unknown): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    throw new PreferenceValidationError("targetFingerprint 必须是 64 位小写 SHA-256");
  }
  return value;
}

export function normalizeSource(value: unknown): PreferenceSource {
  if (value !== "explicit_user" && value !== "behavior_confirmed") {
    throw new PreferenceValidationError("Preference source 无效");
  }
  return value;
}

export function normalizeStatus(value: unknown): "active" | "disabled" {
  if (value !== "active" && value !== "disabled") throw new PreferenceValidationError("Preference status 无效");
  return value;
}

export function nullableHash(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new PreferenceValidationError(`${field} 必须是 64 位小写 SHA-256 或 null`);
  return value;
}

export function requiredText(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string") throw new PreferenceValidationError(`${field} 必须是字符串`);
  const normalized = value.normalize("NFKC").trim();
  if (!normalized || normalized.length > maxLength) throw new PreferenceValidationError(`${field} 不能为空且长度不能超过 ${maxLength}`);
  return normalized;
}
export function normalizeBindingText(value: unknown, field: string): string {
  return requiredText(value, field, 128);
}

export function normalizeEventIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    throw new PreferenceValidationError(`${field} 必须包含 1 到 32 个 event ID`);
  }
  const eventIds = value.map((item, index) => normalizeBindingText(item, `${field}[${index}]`));
  if (new Set(eventIds).size !== eventIds.length) {
    throw new PreferenceValidationError(`${field} 不能包含重复 event ID`);
  }
  return eventIds.sort();
}

export function positiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) throw new PreferenceValidationError(`${field} 必须是正整数`);
  return value;
}

export function boundedInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new PreferenceValidationError(`${field} 必须是 ${min} 到 ${max} 的整数`);
  }
  return value;
}

export function parseStrictRFC3339Timestamp(value: unknown, field: string): number {
  if (typeof value !== "string") throw new PreferenceValidationError(`${field} 必须是 RFC3339 字符串`);
  const match = RFC3339_TIMESTAMP_PATTERN.exec(value);
  if (!match) throw new PreferenceValidationError(`${field} 必须是 RFC3339 字符串`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const maxDay = month === 2
    ? year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (month < 1 || month > 12 || day < 1 || day > maxDay ||
      hour > 23 || minute > 59 || second > 59) {
    throw new PreferenceValidationError(`${field} 必须是有效 RFC3339 时间`);
  }
  const offset = match[8];
  let offsetMinutes = 0;
  if (offset !== "Z") {
    const offsetMatch = /^([+-])(\d{2}):(\d{2})$/u.exec(offset ?? "");
    if (!offsetMatch || Number(offsetMatch[2]) > 23 || Number(offsetMatch[3]) > 59) {
      throw new PreferenceValidationError(`${field} 必须是有效 RFC3339 时间`);
    }
    offsetMinutes = (offsetMatch[1] === "-" ? -1 : 1) *
      (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
  }
  const fraction = match[7] ?? "";
  const milliseconds = fraction.length === 0 ? 0 : Number(fraction.slice(0, 3).padEnd(3, "0"));
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, milliseconds);
  const parsed = date.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(parsed)) throw new PreferenceValidationError(`${field} 必须是有效 RFC3339 时间`);
  return parsed;
}


export function timestamp(value: unknown, field: string): number {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new PreferenceValidationError(`${field} 必须是有效时间`);
  return Date.parse(value);
}

export function nullableTimestamp(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return timestamp(value, field);
}

export function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PreferenceValidationError(`${path} 必须是对象`);
  return value as Record<string, unknown>;
}

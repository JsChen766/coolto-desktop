import type { CareerTargetV1 } from "./career-targets.js";

export function normalizedList(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${path} 必须是字符串数组`);
  if (value.length > 20) throw new Error(`${path} 最多只能有 20 项`);
  const values = value.map((item) => {
    if (typeof item !== "string") throw new Error(`${path} 必须只包含字符串`);
    const normalized = clean(item);
    if (!normalized) throw new Error(`${path} 不能包含空字符串`);
    if ([...normalized].length > 120) throw new Error(`${path} 单项最多 120 个 Unicode 字符`);
    return normalized;
  });
  if (new Set(values).size !== values.length) throw new Error(`${path} 不能包含重复值`);
  return values.sort();
}

export function optionalText(value: unknown, path: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`${path} 必须是字符串或 null`);
  const normalized = clean(value);
  if ([...normalized].length > 120) throw new Error(`${path} 最多 120 个 Unicode 字符`);
  return normalized || null;
}

export function optionalYears(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 80) {
    throw new Error("yearsOfExperience 必须是 0 到 80 的整数");
  }
  return value;
}

export function normalizeId(value: unknown, path: string): string {
  if (typeof value !== "string") throw new Error(`${path}.id 必须是字符串`);
  const id = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(id)) throw new Error(`${path}.id 格式无效`);
  return id;
}

export function union(values: readonly string[][]): string[] {
  return [...new Set(values.flat())].sort();
}

export function clean(value: string): string {
  return value.normalize("NFKC").trim();
}

export function cleanNullable(value: string | null): string | null {
  return value ? clean(value) : null;
}

export function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} 必须是对象`);
  return value as Record<string, unknown>;
}

export function has(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
export function hasAnyTargetField(record: Record<string, unknown>): boolean {
  return has(record, "careerTargets") || hasTargetField(record);
}

export function hasTargetField(record: Record<string, unknown>): boolean {
  return ["targetRoles", "targetIndustries", "targetLocations"].some((key) => has(record, key));
}

export function legacyProjection(record: Record<string, unknown>) {
  return {
    targetRoles: normalizedList(record.targetRoles === undefined ? [] : record.targetRoles, "targetRoles"),
    targetIndustries: normalizedList(record.targetIndustries === undefined ? [] : record.targetIndustries, "targetIndustries"),
    targetLocations: normalizedList(record.targetLocations === undefined ? [] : record.targetLocations, "targetLocations"),
  };
}

export function stageValues(value: string): boolean {
  return ["student", "early_career", "mid_career", "senior", "leadership", "career_change"].includes(value);
}

export function targetIdentityKey(target: CareerTargetV1): string {
  return JSON.stringify({ role: target.role, industries: target.industries, locations: target.locations });
}

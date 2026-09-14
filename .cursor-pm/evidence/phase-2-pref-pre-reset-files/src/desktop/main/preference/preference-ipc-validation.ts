import {
  isPreferenceKey,
  normalizePreferenceValue,
  preferenceAllowsScope,
} from "../../../preference/key-registry.js";
import { normalizeScope } from "../../../preference/normalizer.js";
import type {
  PreferenceListFilterV1,
  PreferenceMutationInputV1,
  PreferenceScopeKind,
  PreferenceScopeV1,
  PreferenceTurnOverrideV1,
  PreferenceValueV1,
} from "../../../preference/types.js";

const KEYS = ["key", "value", "scope", "priority", "source", "sourceSuggestionHash", "status"] as const;
const SCOPES = ["global", "resume", "job_search", "browser_fill", "interview"] as const;
type PreferencePartialInput = Partial<PreferenceMutationInputV1> & { status?: "active" | "disabled" };

export interface PreferenceResolveRequest {
  sessionId?: string;
  turnId?: string;
  actionId?: string;
  taskScope?: PreferenceScopeKind;
  targetFingerprint?: string | null;
  domain?: string | null;
  currentOverrides?: PreferenceTurnOverrideV1[];
}

export function preferenceId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw new Error("Preference id 无效");
  return value;
}

export function proposalId(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("preference-") || value.length > 140) throw new Error("Preference proposalId 无效");
  return value;
}

export function suggestionId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) throw new Error("Preference suggestion id 无效");
  return value;
}

export function createMutationInput(value: unknown): PreferenceMutationInputV1 {
  const record = mutationInput(value, false);
  if (!isPreferenceKey(record.key) || record.value === undefined || record.scope === undefined || record.priority === undefined) throw new Error("Preference 创建字段不完整");
  return {
    key: record.key, value: record.value, scope: record.scope,
    priority: record.priority,
    ...(record.source === undefined ? {} : { source: record.source }),
    ...(record.sourceSuggestionHash === undefined ? {} : { sourceSuggestionHash: record.sourceSuggestionHash }),
  };
}

export function mutationInput(value: unknown, partial = false): PreferencePartialInput {
  const record = object(value, "Preference 修改");
  for (const key of Object.keys(record)) if (!KEYS.includes(key as typeof KEYS[number])) throw new Error(`Preference 包含未知字段：${key}`);
  let key: PreferenceMutationInputV1["key"] | undefined;
  if (record.key !== undefined || !partial) {
    if (!isPreferenceKey(record.key)) throw new Error("Preference key 不在注册表中");
    key = record.key;
    record.key = key;
  }
  if (record.value !== undefined || !partial) {
    if (!key) throw new Error("Preference value 缺少 key");
    record.value = normalizePreferenceValue(key, record.value);
  }
  if (record.scope !== undefined || !partial) {
    if (!key) throw new Error("Preference scope 缺少 key");
    const scope = normalizeScope(record.scope);
    if (!preferenceAllowsScope(key, scope.kind)) throw new Error("Preference key 不支持该作用域");
    record.scope = scope;
  }
  if (record.priority !== undefined || !partial) {
    if (!Number.isInteger(record.priority) || record.priority < 0 || record.priority > 100) throw new Error("Preference priority 必须是 0 到 100 的整数");
  }
  if (record.source !== undefined && record.source !== "explicit_user" && record.source !== "behavior_confirmed") throw new Error("Preference source 无效");
  if (record.sourceSuggestionHash !== undefined && record.sourceSuggestionHash !== null &&
      (typeof record.sourceSuggestionHash !== "string" || !/^[0-9a-f]{64}$/u.test(record.sourceSuggestionHash))) throw new Error("Preference sourceSuggestionHash 无效");
  if (record.status !== undefined && record.status !== "active" && record.status !== "disabled") throw new Error("Preference status 无效");
  return record as PreferencePartialInput;
}

export function listFilter(value: unknown): PreferenceListFilterV1 {
  if (value === undefined || value === null) return {};
  const record = object(value, "Preference 筛选");
  const allowed = ["kind", "domain", "targetFingerprint", "includeDisabled"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new Error("Preference 筛选字段无效");
  if (record.kind !== undefined && !SCOPES.includes(record.kind as PreferenceScopeKind)) throw new Error("Preference scope 无效");
  if (record.domain !== undefined && typeof record.domain !== "string") throw new Error("Preference domain 无效");
  if (record.targetFingerprint !== undefined && typeof record.targetFingerprint !== "string") throw new Error("Preference targetFingerprint 无效");
  if (record.includeDisabled !== undefined && typeof record.includeDisabled !== "boolean") throw new Error("Preference includeDisabled 无效");
  return record as PreferenceListFilterV1;
}

export function resolveInput(value: unknown): PreferenceResolveRequest {
  if (value === undefined || value === null) return {};
  const record = object(value, "Preference resolution");
  const allowed = ["sessionId", "turnId", "actionId", "taskScope", "targetFingerprint", "domain", "currentOverrides"];
  if (Object.keys(record).some((key) => !allowed.includes(key))) throw new Error("Preference resolution 字段无效");
  for (const key of ["sessionId", "turnId", "actionId"] as const) {
    if (record[key] !== undefined && (typeof record[key] !== "string" || !record[key].trim() || record[key].length > 128)) throw new Error(`Preference ${key} 无效`);
  }
  if (record.taskScope !== undefined && !SCOPES.includes(record.taskScope as PreferenceScopeKind)) throw new Error("Preference taskScope 无效");
  for (const key of ["targetFingerprint", "domain"] as const) {
    if (record[key] !== undefined && record[key] !== null && typeof record[key] !== "string") throw new Error(`Preference ${key} 无效`);
  }
  if (record.targetFingerprint !== undefined && record.targetFingerprint !== null && !/^[0-9a-f]{64}$/u.test(record.targetFingerprint as string)) throw new Error("Preference targetFingerprint 无效");
  if (record.currentOverrides !== undefined) {
    if (!Array.isArray(record.currentOverrides) || record.currentOverrides.length > 20) throw new Error("Preference currentOverrides 无效");
    record.currentOverrides = record.currentOverrides.map(normalizeOverride);
  }
  return record as PreferenceResolveRequest;
}

function normalizeOverride(value: unknown): PreferenceTurnOverrideV1 {
  const record = object(value, "Preference override");
  if (!isPreferenceKey(record.key)) throw new Error("Preference override key 无效");
  const result: PreferenceTurnOverrideV1 = {
    key: record.key, value: normalizePreferenceValue(record.key, record.value),
  };
  if (record.scope !== undefined) result.scope = normalizeScope(record.scope) as PreferenceScopeV1;
  if (record.reason !== undefined) {
    if (typeof record.reason !== "string" || record.reason.length > 500) throw new Error("Preference override reason 无效");
    result.reason = record.reason;
  }
  return result;
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} 必须是对象`);
  return value as Record<string, unknown>;
}

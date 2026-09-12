import { canonicalHash } from "../agent-task/canonical-hash.js";
import type { JsonValue } from "../agent-task/json-types.js";
import {
  boundedInteger,
  HASH_PATTERN,
  nullableHash,
  nullableTimestamp,
  normalizeDomain,
  normalizeFingerprint,
  normalizeSource,
  normalizeStatus,
  objectValue,
  PREFERENCE_SCOPE_KIND_SET,
  positiveInteger,
  PreferenceValidationError,
  requiredText,
  timestamp,
} from "./preference-validation.js";
import {
  preferenceAllowsScope,
  normalizePreferenceValue,
  preferenceKeyDefinition,
} from "./key-registry.js";
import type {
  PreferenceKeyV1,
  PreferenceMutationAction,
  PreferenceProposalInputV1,
  PreferenceScopeKind,
  PreferenceScopeV1,
  PreferenceSource,
  PreferenceV1,
} from "./types.js";
export { PreferenceValidationError } from "./preference-validation.js";


export function normalizeScope(input: unknown): PreferenceScopeV1 {
  const record = objectValue(input, "Preference scope");
  const kind = record.kind;
  if (!PREFERENCE_SCOPE_KIND_SET.includes(kind as PreferenceScopeKind)) throw new PreferenceValidationError("Preference scope kind 无效");
  const domain = record.domain === undefined ? undefined : normalizeDomain(record.domain);
  const targetFingerprint = record.targetFingerprint === undefined
    ? undefined
    : normalizeFingerprint(record.targetFingerprint);
  if (kind === "global" && (domain !== undefined || targetFingerprint !== undefined)) {
    throw new PreferenceValidationError("global scope 不允许 domain 或 targetFingerprint");
  }
  if (kind === "browser_fill" && targetFingerprint !== undefined) {
    throw new PreferenceValidationError("browser_fill scope 不允许 targetFingerprint");
  }
  if (kind !== "browser_fill" && domain !== undefined) {
    throw new PreferenceValidationError("只有 browser_fill scope 允许 domain");
  }
  if (kind !== "global" && kind !== "browser_fill" && targetFingerprint !== undefined && !HASH_PATTERN.test(targetFingerprint)) {
    throw new PreferenceValidationError("targetFingerprint 必须是 64 位小写 SHA-256");
  }
  const normalized = { kind } as PreferenceScopeV1;
  if (domain !== undefined) normalized.domain = domain;
  if (targetFingerprint !== undefined) normalized.targetFingerprint = targetFingerprint;
  return normalized;
}

export function scopeKey(scope: PreferenceScopeV1): string {
  const normalized = normalizeScope(scope);
  if (normalized.kind === "global") return "global";
  return `${normalized.kind}:${normalized.targetFingerprint ?? normalized.domain ?? "*"}`;
}

export function normalizePreference(input: unknown): PreferenceV1 {
  const record = objectValue(input, "Preference");
  if (record.version !== 1) throw new PreferenceValidationError("Preference version 必须是 1");
  const id = requiredText(record.id, "Preference.id");
  const ownerId = requiredText(record.ownerId, "Preference.ownerId");
  const entityVersion = positiveInteger(record.entityVersion, "Preference.entityVersion");
  const key = record.key as PreferenceKeyV1;
  const definition = preferenceKeyDefinition(key);
  const value = normalizePreferenceValue(key, record.value);
  const scope = normalizeScope(record.scope);
  if (!preferenceAllowsScope(key, scope.kind)) throw new PreferenceValidationError(`${key} 不支持 ${scope.kind} scope`);
  const priority = boundedInteger(record.priority, "Preference.priority", 0, 100);
  const conflictGroup = requiredText(record.conflictGroup, "Preference.conflictGroup");
  if (conflictGroup !== definition.conflictGroup) throw new PreferenceValidationError("conflictGroup 必须由 key registry 决定");
  const source = normalizeSource(record.source);
  const sourceSuggestionHash = nullableHash(record.sourceSuggestionHash, "sourceSuggestionHash");
  const ruleVersion = requiredText(record.ruleVersion, "Preference.ruleVersion");
  if (ruleVersion !== definition.ruleVersion) throw new PreferenceValidationError("ruleVersion 与 key registry 不一致");
  if (source === "explicit_user" && sourceSuggestionHash !== null) {
    throw new PreferenceValidationError("explicit_user Preference 不得携带 suggestion provenance");
  }
  if (source === "behavior_confirmed") {
    if (sourceSuggestionHash === null) throw new PreferenceValidationError("behavior_confirmed Preference 必须携带 suggestion provenance");
    if (sourceSuggestionHash !== preferencePatternHash(key, value, scope, ruleVersion)) {
      throw new PreferenceValidationError("behavior_confirmed provenance 必须匹配规范化 suggestion pattern");
    }
  }
  const confirmedAt = timestamp(record.confirmedAt, "Preference.confirmedAt");
  const createdAt = timestamp(record.createdAt, "Preference.createdAt");
  const updatedAt = timestamp(record.updatedAt, "Preference.updatedAt");
  if (updatedAt < createdAt) throw new PreferenceValidationError("updatedAt 不能早于 createdAt");
  const deletedAt = nullableTimestamp(record.deletedAt, "Preference.deletedAt");
  const expiresAtRaw = record.expiresAt === undefined
    ? null : nullableTimestamp(record.expiresAt, "Preference.expiresAt");
  if (record.expiresAt !== undefined && expiresAtRaw !== null && expiresAtRaw <= confirmedAt) {
    throw new PreferenceValidationError("expiresAt 必须晚于 confirmedAt");
  }
  const expiresAt = record.expiresAt === undefined
    ? undefined : expiresAtRaw === null ? null : new Date(expiresAtRaw).toISOString();
  const status = normalizeStatus(record.status);
  const contentHash = preferenceContentHash({
    key, value, scope, priority, conflictGroup, source, ruleVersion, status,
  });
  if (record.contentHash !== undefined && record.contentHash !== contentHash) {
    throw new PreferenceValidationError("Preference contentHash 与规范化内容不匹配");
  }
  const result: PreferenceV1 = {
    version: 1, id, ownerId, entityVersion, key, value, scope, priority,
    conflictGroup, source, sourceSuggestionHash, status, ruleVersion,
    confirmedAt: new Date(confirmedAt).toISOString(),
    createdAt: new Date(createdAt).toISOString(), updatedAt: new Date(updatedAt).toISOString(),
    deletedAt: deletedAt === null ? null : new Date(deletedAt).toISOString(), contentHash,
  };
  if (expiresAt !== undefined) result.expiresAt = expiresAt;
  return result;
}

export function validatePreferenceInput(input: unknown): readonly string[] {
  try {
    normalizePreference(input);
    return [];
  } catch (error) {
    return [error instanceof Error ? error.message : "Preference 输入无效"];
  }
}

export function normalizePreferenceProposalInput(input: unknown): PreferenceProposalInputV1 {
  const record = objectValue(input, "Preference proposal");
  const action = record.action;
  if (!["create", "update", "disable", "delete"].includes(action as string)) {
    throw new PreferenceValidationError("Preference proposal action 无效");
  }
  const ownerId = requiredText(record.ownerId, "Preference proposal.ownerId");
  const preferenceId = record.preferenceId === undefined || record.preferenceId === null
    ? null : requiredText(record.preferenceId, "Preference proposal.preferenceId");
  if (action !== "create" && preferenceId === null) {
    throw new PreferenceValidationError(`${action} proposal 必须包含 preferenceId`);
  }
  if (action === "create" && preferenceId !== null) {
    throw new PreferenceValidationError("create proposal 不得预先指定 preferenceId");
  }
  const expectedEntityVersion = record.expectedEntityVersion === undefined || record.expectedEntityVersion === null
    ? null : positiveInteger(record.expectedEntityVersion, "expectedEntityVersion");
  if (action !== "create" && expectedEntityVersion === null) {
    throw new PreferenceValidationError(`${action} proposal 必须携带 expectedEntityVersion`);
  }
  if (action === "create" && expectedEntityVersion !== null) {
    throw new PreferenceValidationError("create proposal 不得携带 expectedEntityVersion");
  }
  const preference = record.preference === undefined || record.preference === null
    ? null : normalizePreference(record.preference);
  if ((action === "create" || action === "update" || action === "disable") && preference === null) {
    throw new PreferenceValidationError(`${action} proposal 必须包含 preference 快照`);
  }
  if (action === "delete" && preference !== null) {
    throw new PreferenceValidationError("delete proposal 不得携带 replacement preference");
  }
  if (preference && preference.ownerId !== ownerId) throw new PreferenceValidationError("Preference ownerId 不匹配");
  if (preference && action !== "create" && preference.id !== preferenceId) {
    throw new PreferenceValidationError("Preference snapshot 与 preferenceId 不匹配");
  }
  if (action === "create" && preference && (preference.status !== "active" || preference.deletedAt !== null)) {
    throw new PreferenceValidationError("create proposal 只能包含 active、未删除 Preference");
  }
  if (action === "disable" && preference && (preference.status !== "disabled" || preference.deletedAt !== null)) {
    throw new PreferenceValidationError("disable proposal 必须包含 disabled、未删除 Preference");
  }
  return {
    action: action as PreferenceMutationAction, ownerId, preferenceId, expectedEntityVersion, preference,
  };
}

export function preferenceValueHash(value: unknown, key?: PreferenceKeyV1): string {
  const normalized = key ? normalizePreferenceValue(key, value) : normalizeGenericValue(value);
  return canonicalHash(normalized as unknown as JsonValue);
}

export function preferencePatternHash(
  key: PreferenceKeyV1,
  value: unknown,
  scope: PreferenceScopeV1,
  ruleVersion = preferenceKeyDefinition(key).ruleVersion,
): string {
  return canonicalHash({
    key, value: normalizePreferenceValue(key, value), scopeKey: scopeKey(scope), ruleVersion,
  } as unknown as JsonValue);
}

export function preferenceContentHash(input: {
  key: PreferenceKeyV1;
  value: unknown;
  scope: PreferenceScopeV1;
  priority: number;
  conflictGroup: string;
  source: PreferenceSource;
  ruleVersion: string;
  status: "active" | "disabled";
}): string {
  return canonicalHash({
    key: input.key, value: normalizePreferenceValue(input.key, input.value),
    scopeKey: scopeKey(input.scope), priority: input.priority,
    conflictGroup: input.conflictGroup, source: input.source,
    ruleVersion: input.ruleVersion, status: input.status,
  } as unknown as JsonValue);
}

function normalizeGenericValue(value: unknown): string | string[] {
  if (typeof value === "string") return value.normalize("NFKC").trim();
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.map((item) => item.normalize("NFKC").trim()).sort();
  }
  throw new PreferenceValidationError("Preference value 类型无效");
}


import { canonicalHash } from "../agent-task/canonical-hash.js";
import type { JsonValue } from "../agent-task/json-types.js";
import {
  isPreferenceKey,
  normalizePreferenceValue,
  preferenceAllowsScope,
  preferenceKeyDefinition,
} from "./key-registry.js";
import {
  normalizeScope,
  preferencePatternHash,
  scopeKey,
} from "./normalizer.js";
import {
  normalizeBindingText,
  normalizeEventIds,
  parseStrictRFC3339Timestamp,
} from "./preference-validation.js";
import {
  PREFERENCE_SUGGESTION_RATIONALE_CODES,
  type PreferenceBehaviorBindingV1,
  type PreferenceEvidenceReferenceResolverV1,
  type PreferenceKeyV1,
  type PreferenceScopeV1,
  type PreferenceSuggestionRationaleCodeV1,
  type PreferenceSuggestionRationaleV1,
  type PreferenceSuggestionV1,
} from "./types.js";
const MAX_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
export interface PreferenceSuggestionDraftV1 extends PreferenceBehaviorBindingV1 {
  id: string;
  key: PreferenceKeyV1;
  proposedValue: unknown;
  scope: PreferenceScopeV1;
  observationCount: number;
  observationActionCount: number;
  observationWindow: { from: string; to: string };
  confidence: "possible" | "strong";
  rationale: PreferenceSuggestionRationaleV1;
  createdAt: string;
  expiresAt: string;
  ruleVersion?: string;
}
export function createPreferenceSuggestion(
  input: PreferenceSuggestionDraftV1,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
  now: string | number,
): PreferenceSuggestionV1 {
  if (!evidenceResolver || typeof evidenceResolver.resolve !== "function") {
    throw new Error("behavior suggestion 必须绑定 evidence reference resolver");
  }
  if (!isPreferenceSuggestionEligible(
    input.observationCount, input.observationActionCount, input.observationWindow,
  )) {
    throw new Error("Preference suggestion 需要至少三次、至少两个用户动作且在 30 天窗口内");
  }
  const definition = preferenceKeyDefinition(input.key);
  return normalizePreferenceSuggestion({
    ...input, version: 1, state: "pending",
    conflictGroup: definition.conflictGroup,
    ruleVersion: input.ruleVersion ?? definition.ruleVersion,
    lastPresentedAt: null,
  }, evidenceResolver, now);
}
export function normalizePreferenceSuggestion(
  input: unknown,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
  now: string | number,
): PreferenceSuggestionV1 {
  if (!evidenceResolver || typeof evidenceResolver.resolve !== "function") {
    throw new Error("behavior suggestion 必须绑定 evidence reference resolver");
  }
  const record = objectValue(input, "Preference suggestion");
  if (record.version !== 1) throw new Error("Preference suggestion version 必须是 1");
  const id = requiredText(record.id, "suggestion.id");
  const ownerId = requiredText(record.ownerId, "suggestion.ownerId");
  const sessionId = normalizeBindingText(record.sessionId, "suggestion.sessionId");
  const turnId = normalizeBindingText(record.turnId, "suggestion.turnId");
  const actionId = normalizeBindingText(record.actionId, "suggestion.actionId");
  const eventIds = normalizeEventIds(record.eventIds, "suggestion.eventIds");
  if (!isPreferenceKey(record.key)) throw new Error("Preference suggestion key 无效");
  const key = record.key;
  const definition = preferenceKeyDefinition(key);
  const scope = normalizeScope(record.scope);
  if (!preferenceAllowsScope(key, scope.kind)) throw new Error(`${key} 不支持 ${scope.kind} scope`);
  const proposedValue = normalizePreferenceValue(key, record.proposedValue);
  const conflictGroup = requiredText(record.conflictGroup, "suggestion.conflictGroup");
  if (conflictGroup !== definition.conflictGroup) throw new Error("suggestion conflictGroup 与 key registry 不一致");
  const ruleVersion = record.ruleVersion === undefined
    ? definition.ruleVersion : requiredText(record.ruleVersion, "suggestion.ruleVersion");
  if (ruleVersion !== definition.ruleVersion) throw new Error("suggestion ruleVersion 与 key registry 不一致");
  const observationCount = integerAtLeast(record.observationCount, "observationCount", 1);
  const observationActionCount = integerAtLeast(record.observationActionCount, "observationActionCount", 2);
  const observationWindow = normalizeWindow(record.observationWindow);
  if (!isPreferenceSuggestionEligible(observationCount, observationActionCount, observationWindow)) {
    throw new Error("Preference suggestion 需要至少三次、至少两个用户动作且在 30 天窗口内");
  }
  const confidence = record.confidence;
  if (confidence !== "possible" && confidence !== "strong") throw new Error("suggestion confidence 无效");
  const createdAt = timestamp(record.createdAt, "suggestion.createdAt");
  const expiresAt = timestamp(record.expiresAt, "suggestion.expiresAt");
  if (expiresAt <= createdAt) throw new Error("suggestion expiresAt 必须晚于 createdAt");
  const validationNow = typeof now === "number" && Number.isFinite(now)
    ? now : timestamp(now, "suggestion.validationNow");
  const rationale = normalizeRationale(
    record.rationale, { ownerId, sessionId, turnId, actionId }, eventIds, evidenceResolver, validationNow,
  );
  const lastPresentedAt = record.lastPresentedAt === null || record.lastPresentedAt === undefined
    ? null : new Date(timestamp(record.lastPresentedAt, "suggestion.lastPresentedAt")).toISOString();
  const state = record.state;
  if (state !== "pending" && state !== "accepted" && state !== "rejected" && state !== "expired") throw new Error("suggestion state 无效");
  const acceptedAt = record.acceptedAt === undefined || record.acceptedAt === null
    ? null : new Date(timestamp(record.acceptedAt, "suggestion.acceptedAt")).toISOString();
  const acceptedPreferenceId = record.acceptedPreferenceId === undefined || record.acceptedPreferenceId === null
    ? null : requiredText(record.acceptedPreferenceId, "suggestion.acceptedPreferenceId");
  if (state === "accepted" && (!acceptedAt || !acceptedPreferenceId)) {
    throw new Error("accepted suggestion 必须记录 acceptedAt 和 acceptedPreferenceId");
  }
  if (state !== "accepted" && (acceptedAt !== null || acceptedPreferenceId !== null)) {
    throw new Error("非 accepted suggestion 不得携带 accepted provenance");
  }
  const patternHash = preferencePatternHash(key, proposedValue, scope, ruleVersion);
  if (record.patternHash !== undefined && record.patternHash !== patternHash) throw new Error("suggestion patternHash 不匹配");
  const result: PreferenceSuggestionV1 = {
    version: 1, id, ownerId, sessionId, turnId, actionId, eventIds,
    patternHash, key, proposedValue, scope, conflictGroup,
    observationCount, observationActionCount, observationWindow, confidence, rationale, state,
    createdAt: new Date(createdAt).toISOString(), lastPresentedAt, expiresAt: new Date(expiresAt).toISOString(),
    ...(state === "accepted" ? { acceptedAt, acceptedPreferenceId } : {}),
  };
  result.ruleVersion = ruleVersion;
  return result;
}
export function isPreferenceSuggestionEligible(
  observationCount: number,
  observationActionCount: number,
  window: { from: string; to: string },
): boolean {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  return Number.isInteger(observationCount) && observationCount >= 3 &&
    Number.isInteger(observationActionCount) && observationActionCount >= 2 &&
    Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from <= MAX_WINDOW_MS;
}

export function suggestionIdentity(suggestion: PreferenceSuggestionV1): string {
  return canonicalHash({
    ownerId: suggestion.ownerId, sessionId: suggestion.sessionId,
    turnId: suggestion.turnId, actionId: suggestion.actionId,
    eventIds: [...suggestion.eventIds].sort(), referenceHashes: [...suggestion.rationale.referenceHashes].sort(),
    patternHash: suggestion.patternHash, key: suggestion.key,
    scopeKey: scopeKey(suggestion.scope), ruleVersion: suggestion.ruleVersion ?? preferenceKeyDefinition(suggestion.key).ruleVersion,
  } as unknown as JsonValue);
}

export function verifyPreferenceSuggestionEvidence(
  suggestion: Pick<PreferenceSuggestionV1, "ownerId" | "sessionId" | "turnId" | "actionId" | "eventIds" | "rationale" | "createdAt">,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
  now: string | number,
): void {
  if (!evidenceResolver || typeof evidenceResolver.resolve !== "function") {
    throw new Error("behavior suggestion 必须绑定 evidence reference resolver");
  }
  const validationNow = typeof now === "number" && Number.isFinite(now)
    ? now : timestamp(now, "suggestion.validationNow");
  const eventIds = normalizeEventIds(suggestion.eventIds, "suggestion.eventIds");
  normalizeRationale(
    suggestion.rationale,
    {
      ownerId: suggestion.ownerId, sessionId: suggestion.sessionId,
      turnId: suggestion.turnId, actionId: suggestion.actionId,
    },
    eventIds, evidenceResolver, validationNow,
  );
}

function normalizeWindow(value: unknown): { from: string; to: string } {
  const record = objectValue(value, "suggestion.observationWindow");
  const from = timestamp(record.from, "observationWindow.from");
  const to = timestamp(record.to, "observationWindow.to");
  if (to < from || to - from > MAX_WINDOW_MS) throw new Error("observationWindow 必须不超过 30 天");
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

function normalizeRationale(
  value: unknown,
  binding: Pick<PreferenceBehaviorBindingV1, "ownerId" | "sessionId" | "turnId" | "actionId">,
  eventIds: readonly string[],
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
  now: number,
): PreferenceSuggestionRationaleV1 {
  const record = objectValue(value, "suggestion.rationale");
  const keys = Object.keys(record);
  if (keys.some((key) => key !== "code" && key !== "referenceHashes")) {
    throw new Error("suggestion rationale 只能包含 reason code 和 hashed references");
  }
  const code = record.code;
  if (!PREFERENCE_SUGGESTION_RATIONALE_CODES.includes(code as PreferenceSuggestionRationaleCodeV1)) {
    throw new Error("suggestion rationale code 无效");
  }
  if (!Array.isArray(record.referenceHashes) || record.referenceHashes.length < 1 || record.referenceHashes.length > 8) {
    throw new Error("suggestion rationale referenceHashes 必须是 1 到 8 个哈希");
  }
  const referenceHashes = record.referenceHashes.map((value, index) => {
    if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
      throw new Error(`suggestion rationale referenceHashes[${index}] 无效`);
    }
    const evidence = evidenceResolver.resolve(value);
    if (!evidence || evidence.referenceHash !== value ||
        evidence.ownerId !== binding.ownerId || evidence.sessionId !== binding.sessionId ||
        evidence.turnId !== binding.turnId || evidence.actionId !== binding.actionId ||
        typeof evidence.eventId !== "string" || !eventIds.includes(evidence.eventId)) {
      throw new Error(`suggestion rationale referenceHashes[${index}] evidence 未注册或绑定已失效`);
    }
    const evidenceExpiresAt = parseStrictRFC3339Timestamp(
      evidence.expiresAt, `suggestion rationale referenceHashes[${index}] evidence.expiresAt`,
    );
    if (evidenceExpiresAt <= now) {
      throw new Error(`suggestion rationale referenceHashes[${index}] evidence 未注册或绑定已失效`);
    }
    return value;
  });
  if (new Set(referenceHashes).size !== referenceHashes.length) {
    throw new Error("suggestion rationale referenceHashes 不能重复");
  }
  return { code: code as PreferenceSuggestionRationaleCodeV1, referenceHashes };
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} 必须是字符串`);
  const text = value.normalize("NFKC").trim();
  if (!text || text.length > 500) throw new Error(`${field} 不能为空且长度不能超过 500`);
  return text;
}

function integerAtLeast(value: unknown, field: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) throw new Error(`${field} 必须是有效整数`);
  return value;
}

function timestamp(value: unknown, field: string): number {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${field} 必须是有效时间`);
  return Date.parse(value);
}

function objectValue(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path} 必须是对象`);
  return value as Record<string, unknown>;
}

import { canonicalHash } from "../agent-task/canonical-hash.js";
import type { JsonValue } from "../agent-task/json-types.js";
import { isPreferenceKey, preferenceAllowsScope, preferenceKeyDefinition } from "./key-registry.js";
import { verifyPreferenceSuggestionEvidence } from "./suggestion-types.js";
import {
  normalizeBindingText,
  normalizeEventIds,
  parseStrictRFC3339Timestamp,
} from "./preference-validation.js";
import { normalizeScope, scopeKey } from "./normalizer.js";
import type {
  PreferenceBehaviorBindingV1,
  PreferenceEvidenceReferenceResolverV1,
  PreferenceSuggestionSuppressionV1,
  PreferenceSuggestionV1,
} from "./types.js";

export const SUGGESTION_SUPPRESSION_TTL_DAYS = 90;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
type SuggestionBinding = Pick<
  PreferenceBehaviorBindingV1,
  "ownerId" | "sessionId" | "turnId" | "actionId" | "eventIds"
>;

type SuppressionPatternAuthorityInput = Pick<
  PreferenceSuggestionSuppressionV1,
  "ownerId" | "sessionId" | "turnId" | "actionId" | "eventIds" |
  "patternHash" | "referenceHashes" | "key" | "scope" | "ruleVersion"
>;

function suppressionPatternAuthority(input: SuppressionPatternAuthorityInput): string {
  return canonicalHash({
    binding: {
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      actionId: input.actionId,
      eventIds: [...input.eventIds].sort(),
    },
    patternHash: input.patternHash,
    referenceHashes: [...input.referenceHashes].sort(),
    key: input.key,
    scopeKey: scopeKey(input.scope),
    ruleVersion: input.ruleVersion,
  } as unknown as JsonValue);
}
export interface SuggestionRejectionInput extends SuggestionBinding {
  rejectedAt: string;
  ttlDays?: number;
}

export function suggestionSuppressionKey(input: SuggestionBinding & {
  patternHash: string;
  key: string;
  scope: PreferenceSuggestionV1["scope"];
  ruleVersion: string;
}): string {
  if (!HASH_PATTERN.test(input.patternHash)) throw new Error("suppression patternHash 无效");
  if (!isPreferenceKey(input.key)) throw new Error("suppression key 无效");
  const definition = preferenceKeyDefinition(input.key);
  if (input.ruleVersion !== definition.ruleVersion) throw new Error("suppression ruleVersion 无效");
  const normalizedScope = normalizeScope(input.scope);
  if (!preferenceAllowsScope(input.key, normalizedScope.kind)) throw new Error("suppression scope 无效");
  const binding = JSON.stringify({
    ownerId: input.ownerId, sessionId: input.sessionId, turnId: input.turnId,
    actionId: input.actionId, eventIds: [...input.eventIds].sort(),
  });
  return `${binding}:${input.patternHash}:${input.key}:${scopeKey(normalizedScope)}:${input.ruleVersion}`;
}

export function createSuggestionSuppression(
  suggestion: PreferenceSuggestionV1,
  input: SuggestionRejectionInput,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
  now: string | number,
): PreferenceSuggestionSuppressionV1 {
  if (suggestion.state !== "pending") throw new Error("只有 pending suggestion 可以被拒绝");
  const binding = normalizeBinding(input);
  assertMatchingBinding(suggestion, binding);
  const current = parseHostTimestamp(now, "now");
  verifyPreferenceSuggestionEvidence(suggestion, evidenceResolver, current);
  const rejectedAt = parseStrictRFC3339Timestamp(input.rejectedAt, "rejectedAt");
  if (rejectedAt > current) throw new Error("rejectedAt 不能晚于 now");
  const ttlDays = input.ttlDays ?? SUGGESTION_SUPPRESSION_TTL_DAYS;
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > SUGGESTION_SUPPRESSION_TTL_DAYS) {
    throw new Error("suppression TTL 必须在 1 到 90 天之间");
  }
  const ruleVersion = suggestion.ruleVersion ?? "";
  if (!ruleVersion) throw new Error("suggestion ruleVersion 缺失");
  const entry = {
    version: 1 as const, ...binding, patternHash: suggestion.patternHash,
    referenceHashes: [...suggestion.rationale.referenceHashes],
    key: suggestion.key, scope: normalizeScope(suggestion.scope), ruleVersion,
    suppressedAt: new Date(rejectedAt).toISOString(),
    expiresAt: new Date(rejectedAt + ttlDays * 24 * 60 * 60 * 1000).toISOString(),
  };
  return { ...entry, patternAuthorityHash: suppressionPatternAuthority(entry) };
}

export function rejectPreferenceSuggestion(
  suggestion: PreferenceSuggestionV1,
  input: SuggestionRejectionInput,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
  now: string | number,
): { suggestion: PreferenceSuggestionV1; suppression: PreferenceSuggestionSuppressionV1 } {
  const suppression = createSuggestionSuppression(suggestion, input, evidenceResolver, now);
  return {
    suggestion: { ...structuredClone(suggestion), state: "rejected" },
    suppression,
  };
}

export function isSuggestionSuppressed(
  suggestion: PreferenceSuggestionV1,
  suppressions: readonly PreferenceSuggestionSuppressionV1[],
  now: string | number,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
): boolean {
  const current = parseHostTimestamp(now, "now");
  const binding = normalizeBinding(suggestion, "suggestion");
  const entries = suppressions.map((entry) => validateSuppression(entry, binding, evidenceResolver, current));
  verifyPreferenceSuggestionEvidence(suggestion, evidenceResolver, current);
  if (suggestion.state !== "pending") return false;
  const key = suggestionSuppressionKey({
    ...suggestion, patternHash: suggestion.patternHash, key: suggestion.key,
    scope: suggestion.scope, ruleVersion: suggestion.ruleVersion ?? "",
  });
  return entries.some(({ entry, expiresAt }) =>
    expiresAt > current && suggestionSuppressionKey(entry) === key,
  );
}

export function activeSuggestionSuppressions(
  bindingInput: SuggestionBinding,
  suppressions: readonly PreferenceSuggestionSuppressionV1[],
  now: string | number,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
): PreferenceSuggestionSuppressionV1[] {
  requireEvidenceResolver(evidenceResolver);
  const current = parseHostTimestamp(now, "now");
  const binding = normalizeBinding(bindingInput);
  return suppressions
    .map((entry) => validateSuppression(entry, binding, evidenceResolver, current))
    .filter(({ expiresAt }) => expiresAt > current)
    .map(({ entry }) => structuredClone(entry));
}

function validateSuppression(
  entry: PreferenceSuggestionSuppressionV1,
  expectedBinding: SuggestionBinding,
  evidenceResolver: PreferenceEvidenceReferenceResolverV1,
  now: number,
): { entry: PreferenceSuggestionSuppressionV1; expiresAt: number } {
  if (!entry || entry.version !== 1) throw new Error("suppression version 无效");
  const binding = normalizeBinding(entry);
  assertMatchingBinding(binding, expectedBinding);
  const scope = normalizeScope(entry.scope);
  if (!isPreferenceKey(entry.key) || !preferenceAllowsScope(entry.key, scope.kind)) {
    throw new Error("suppression key 或 scope 无效");
  }
  if (entry.ruleVersion !== preferenceKeyDefinition(entry.key).ruleVersion) {
    throw new Error("suppression ruleVersion 无效");
  }
  const suppressedAt = parseStrictRFC3339Timestamp(entry.suppressedAt, "suppression.suppressedAt");
  const expiresAt = parseStrictRFC3339Timestamp(entry.expiresAt, "suppression.expiresAt");
  if (suppressedAt > now) throw new Error("suppression.suppressedAt 不能晚于 now");
  if (expiresAt <= suppressedAt) throw new Error("suppression expiresAt 必须晚于 suppressedAt");
  verifyPreferenceSuggestionEvidence({
    ...binding,
    rationale: { code: "repeated_rejection_pattern", referenceHashes: entry.referenceHashes },
    createdAt: entry.suppressedAt,
  }, evidenceResolver, now);
  const normalizedEntry = { ...entry, ...binding, scope };
  suggestionSuppressionKey(normalizedEntry);
  if (!HASH_PATTERN.test(entry.patternAuthorityHash) ||
      entry.patternAuthorityHash !== suppressionPatternAuthority(normalizedEntry)) {
    throw new Error("suppression pattern authority 无效");
  }
  return { entry: normalizedEntry, expiresAt };
}

function normalizeBinding(input: SuggestionBinding, path = "suppression"): SuggestionBinding {
  return {
    ownerId: normalizeBindingText(input.ownerId, `${path}.ownerId`),
    sessionId: normalizeBindingText(input.sessionId, `${path}.sessionId`),
    turnId: normalizeBindingText(input.turnId, `${path}.turnId`),
    actionId: normalizeBindingText(input.actionId, `${path}.actionId`),
    eventIds: normalizeEventIds(input.eventIds, `${path}.eventIds`),
  };
}

function assertMatchingBinding(
  value: SuggestionBinding,
  expected: SuggestionBinding,
): void {
  if (value.ownerId !== expected.ownerId || value.sessionId !== expected.sessionId ||
      value.turnId !== expected.turnId || value.actionId !== expected.actionId ||
      JSON.stringify([...value.eventIds].sort()) !== JSON.stringify([...expected.eventIds].sort())) {
    throw new Error("suggestion binding 不匹配");
  }
}

function requireEvidenceResolver(value: PreferenceEvidenceReferenceResolverV1): void {
  if (!value || typeof value.resolve !== "function") {
    throw new Error("suppression read 必须绑定 evidence reference resolver");
  }
}

function parseHostTimestamp(value: string | number, field: string): number {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} 必须是有效时间`);
  return parsed;
}



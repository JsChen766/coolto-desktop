import { canonicalHash } from "../agent-task/canonical-hash.js";
import type { JsonValue } from "../agent-task/json-types.js";
import {
  normalizePreferenceValue,
  preferenceAllowsScope,
  preferenceKeyDefinition,
} from "./key-registry.js";
import {
  normalizePreference,
  normalizeScope,
  preferenceValueHash,
  scopeKey,
} from "./normalizer.js";
import { verifyPreferenceSuggestionEvidence } from "./suggestion-types.js";
import {
  normalizeBindingText,
  normalizeDomain,
  normalizeFingerprint,
  PREFERENCE_SCOPE_KIND_SET,
  requiredText,
} from "./preference-validation.js";
import {
  compareApplied,
  compareConflict,
  compareIgnored,
  compareOverridden,
  deepFreeze,
  resolveCandidateGroups,
} from "./resolution-helpers.js";
import type { ResolutionCandidate } from "./resolution-helpers.js";
import type {
  PreferenceKeyV1,
  PreferenceResolutionContextV1,
  PreferenceResolutionIgnored,
  PreferenceResolutionInputV1,
  PreferenceResolutionV1,
  PreferenceScopeKind,
  PreferenceScopeV1,
  PreferenceTurnOverrideV1,
  PreferenceV1,
} from "./types.js";


export function resolvePreferences(input: PreferenceResolutionInputV1): PreferenceResolutionV1 {
  const context = normalizeContext(input.context);
  const contextFingerprint = fingerprintPreferenceContext(context);
  const now = normalizeNow(input.now);
  const ignored: PreferenceResolutionIgnored[] = [];
  const candidates: ResolutionCandidate[] = [];
  for (const preference of input.preferences) addPreference(preference, context, now, candidates, ignored);
  for (const suggestion of input.suggestions ?? []) {
    assertSuggestionContext(suggestion, context);
    if (!input.evidenceResolver) throw new Error("behavior suggestion 缺少 evidence reference resolver");
    verifyPreferenceSuggestionEvidence(suggestion, input.evidenceResolver, now);
    ignored.push({ preferenceId: suggestion.id, reason: `suggestion_${suggestion.state}` });
  }
  for (const override of collectOverrides(input)) addOverride(override, context, candidates, ignored);
  const decisions = resolveCandidateGroups(candidates);
  const applied = decisions.applied.sort(compareApplied);
  const overridden = decisions.overridden.sort(compareOverridden);
  const conflicts = decisions.conflicts.sort(compareConflict);
  ignored.sort(compareIgnored);
  const hashInput = {
    context, contextFingerprint,
    applied: applied.map(({ preferenceId, key, valueHash, scope, reason }) => ({
      preferenceId, key, valueHash, scopeKey: scopeKey(scope), reason,
    })),
    overridden, conflicts, ignored,
  } as unknown as JsonValue;
  const resolutionHash = canonicalHash(hashInput);
  const explainabilitySnapshot = {
    version: 1 as const, contextFingerprint,
    applied: applied.map(({ preferenceId, key, valueHash, reason }) => ({ preferenceId, key, valueHash, reason })),
    overridden, conflicts, ignored,
  };
  return deepFreeze({
    context, contextFingerprint, resolutionHash, applied, overridden, conflicts, ignored,
    explainabilitySnapshot,
  });
}

export function fingerprintPreferenceContext(context: PreferenceResolutionContextV1): string {
  return canonicalHash(normalizeContext(context) as unknown as JsonValue);
}

function addPreference(
  raw: PreferenceV1,
  context: PreferenceResolutionContextV1,
  now: number,
  candidates: ResolutionCandidate[],
  ignored: PreferenceResolutionIgnored[],
): void {
  assertPreferenceOwner(raw, context.ownerId);
  const id = typeof raw?.id === "string" ? raw.id : "invalid-preference";
  let preference: PreferenceV1;
  try {
    preference = normalizePreference(raw);
  } catch {
    ignored.push({ preferenceId: id, reason: "invalid_preference" });
    return;
  }
  if (preference.deletedAt !== null) {
    ignored.push({ preferenceId: preference.id, reason: "deleted" });
    return;
  }
  if (preference.status !== "active") {
    ignored.push({ preferenceId: preference.id, reason: "disabled" });
    return;
  }
  if (preference.expiresAt && Date.parse(preference.expiresAt) <= now) {
    ignored.push({ preferenceId: preference.id, reason: "expired" });
    return;
  }
  const scopeRank = matchingScopeRank(preference.scope, context);
  if (scopeRank === null) {
    ignored.push({ preferenceId: preference.id, reason: "scope_not_applicable" });
    return;
  }
  candidates.push(candidateFromPreference(preference, scopeRank));
}

function addOverride(
  override: PreferenceTurnOverrideV1,
  context: PreferenceResolutionContextV1,
  candidates: ResolutionCandidate[],
  ignored: PreferenceResolutionIgnored[],
): void {
  try {
    const key = override.key;
    const definition = preferenceKeyDefinition(key);
    const value = normalizePreferenceValue(key, override.value);
    const scope = normalizeScope(override.scope ?? contextScope(context));
    if (!preferenceAllowsScope(key, scope.kind)) throw new Error("unsupported override scope");
    const scopeRank = matchingScopeRank(scope, context);
    if (scopeRank === null) throw new Error("override scope mismatch");
    const preferenceId = `current-turn:${canonicalHash({
      ownerId: context.ownerId, sessionId: context.sessionId,
      turnId: context.turnId, actionId: context.actionId,
      key, value, scopeKey: scopeKey(scope),
    } as unknown as JsonValue)}`;
    candidates.push({
      preferenceId, key, value, valueHash: preferenceValueHash(value, key), scope,
      conflictGroup: definition.conflictGroup, scopeRank: 100, priority: 100,
      sourceRank: 2, confirmedAt: Number.MAX_SAFE_INTEGER, current: true,
    });
  } catch {
    ignored.push({ preferenceId: "current-turn", reason: "invalid_current_override" });
  }
}


function candidateFromPreference(preference: PreferenceV1, scopeRank: number): ResolutionCandidate {
  return {
    preferenceId: preference.id, key: preference.key, value: structuredClone(preference.value),
    valueHash: preferenceValueHash(preference.value, preference.key), scope: structuredClone(preference.scope),
    conflictGroup: preference.conflictGroup, scopeRank, priority: preference.priority,
    sourceRank: preference.source === "explicit_user" ? 1 : 0,
    confirmedAt: Date.parse(preference.confirmedAt), current: false,
  };
}

function matchingScopeRank(scope: PreferenceScopeV1, context: PreferenceResolutionContextV1): number | null {
  if (scope.kind === "global") return 1;
  if (scope.kind !== context.taskScope) return null;
  if (scope.kind === "browser_fill") {
    if (!scope.domain) return 2;
    return scope.domain === context.domain ? 3 : null;
  }
  if (!scope.targetFingerprint) return 2;
  return scope.targetFingerprint === context.targetFingerprint ? 4 : null;
}

function normalizeContext(input: PreferenceResolutionContextV1): PreferenceResolutionContextV1 {
  const ownerId = requiredText(input.ownerId, "resolution ownerId");
  const sessionId = normalizeBindingText(input.sessionId, "resolution sessionId");
  const turnId = normalizeBindingText(input.turnId, "resolution turnId");
  const actionId = normalizeBindingText(input.actionId, "resolution actionId");
  if (!PREFERENCE_SCOPE_KIND_SET.includes(input.taskScope as PreferenceScopeKind)) throw new Error("resolution taskScope 无效");
  const targetFingerprint = input.targetFingerprint === null
    ? null : normalizeFingerprint(input.targetFingerprint);
  const domain = input.domain === null ? null : normalizeDomain(input.domain);
  if (input.taskScope === "browser_fill" && targetFingerprint !== null) throw new Error("browser context 不允许 targetFingerprint");
  if (input.taskScope !== "browser_fill" && domain !== null) throw new Error("非 browser context 不允许 domain");
  if (input.taskScope === "global" && targetFingerprint !== null) throw new Error("global context 不允许 targetFingerprint");
  return { ownerId, sessionId, turnId, actionId, taskScope: input.taskScope, targetFingerprint, domain };
}

function contextScope(context: PreferenceResolutionContextV1): PreferenceScopeV1 {
  if (context.taskScope === "global") return { kind: "global" };
  if (context.taskScope === "browser_fill") return context.domain ? { kind: "browser_fill", domain: context.domain } : { kind: "browser_fill" };
  return context.targetFingerprint
    ? { kind: context.taskScope, targetFingerprint: context.targetFingerprint }
    : { kind: context.taskScope };
}

function collectOverrides(input: PreferenceResolutionInputV1): PreferenceTurnOverrideV1[] {
  return [
    ...(input.currentOverride ? [input.currentOverride] : []),
    ...(input.currentOverrides ?? []),
  ];
}

function normalizeNow(value: string | number): number {
  const parsed = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("resolution now 无效");
  return parsed;
}
function assertPreferenceOwner(value: unknown, ownerId: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  if ((value as Record<string, unknown>).ownerId !== ownerId) {
    throw new Error("Preference ownerId 与 resolution context 不匹配");
  }
}

function assertSuggestionContext(value: unknown, context: PreferenceResolutionContextV1): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Preference suggestion context binding 无效");
  }
  const record = value as Record<string, unknown>;
  if (record.ownerId !== context.ownerId || record.sessionId !== context.sessionId ||
      record.turnId !== context.turnId || record.actionId !== context.actionId) {
    throw new Error("Preference suggestion context binding 不匹配");
  }
}

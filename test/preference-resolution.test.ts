import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePreference,
  preferencePatternHash,
} from "../src/preference/normalizer.js";
import {
  fingerprintPreferenceContext,
  resolvePreferences,
} from "../src/preference/resolution.js";
import type { PreferenceResolutionContextV1, PreferenceV1 } from "../src/preference/types.js";

const targetFingerprint = "a".repeat(64);
const context: PreferenceResolutionContextV1 = {
  ownerId: "user-1", sessionId: "session-A", turnId: "turn-1", actionId: "action-1",
  taskScope: "resume", targetFingerprint, domain: null,
};
const base = {
  version: 1 as const, ownerId: "user-1", entityVersion: 1,
  key: "resume.tone" as const, value: "direct", scope: { kind: "global" as const }, priority: 10,
  conflictGroup: "resume.tone", source: "explicit_user" as const, sourceSuggestionHash: null,
  status: "active" as const, ruleVersion: "resume-tone-v1",
  confirmedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null,
};

function preference(id: string, overrides: Record<string, unknown> = {}): PreferenceV1 {
  return normalizePreference({ ...base, id, ...overrides });
}

test("resolution precedence is scope, priority, source, time, then stable ID", () => {
  const global = preference("global", { value: "direct", priority: 100 });
  const task = preference("task", { value: "restrained", scope: { kind: "resume" }, priority: 0 });
  const target = preference("target", { value: "standard", scope: { kind: "resume", targetFingerprint }, priority: 0 });
  const result = resolvePreferences({ preferences: [target, global, task], context, now: "2026-02-01T00:00:00.000Z" });
  assert.equal(result.applied[0]?.value, "standard");
  assert.equal(result.applied[0]?.reason, "selected_by_precedence");
  assert.deepEqual(result.overridden.map((entry) => [entry.preferenceId, entry.reason]), [
    ["global", "scope_more_specific"], ["task", "scope_more_specific"],
  ]);
});

test("priority and source/time precedence apply after equal scope specificity", () => {
  const low = preference("low", { value: "direct", priority: 20, scope: { kind: "resume" } });
  const high = preference("high", {
    value: "restrained", priority: 21, scope: { kind: "resume" },
    source: "behavior_confirmed",
    sourceSuggestionHash: preferencePatternHash("resume.tone", "restrained", { kind: "resume" }),
    confirmedAt: "2026-01-02T00:00:00.000Z",
  });
  const explicit = preference("explicit", {
    value: "standard", priority: 21, scope: { kind: "resume" }, source: "explicit_user",
    sourceSuggestionHash: null, confirmedAt: "2026-01-02T00:00:00.000Z",
  });
  const sourceResult = resolvePreferences({
    preferences: [low, high, explicit], context, now: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(sourceResult.applied[0]?.preferenceId, "explicit");
  assert.equal(sourceResult.overridden.find((entry) => entry.preferenceId === "high")?.reason, "explicit_user_precedence");
  const newer = preference("newer", {
    value: "direct", priority: 21, scope: { kind: "resume" }, source: "explicit_user",
    sourceSuggestionHash: null, confirmedAt: "2026-01-03T00:00:00.000Z",
  });
  const timeResult = resolvePreferences({
    preferences: [explicit, newer], context, now: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(timeResult.applied[0]?.preferenceId, "newer");
  assert.equal(timeResult.overridden.find((entry) => entry.preferenceId === "explicit")?.reason, "newer_confirmation");
});

test("equal-rank conflicting values produce a conflict instead of an ID winner", () => {
  const first = preference("a", { value: "direct", scope: { kind: "resume", targetFingerprint }, priority: 50, source: "explicit_user", sourceSuggestionHash: null });
  const second = preference("b", { value: "restrained", scope: { kind: "resume", targetFingerprint }, priority: 50, source: "explicit_user", sourceSuggestionHash: null });
  const result = resolvePreferences({ preferences: [second, first], context, now: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.conflicts, [{
    key: "resume.tone", conflictGroup: "resume.tone", preferenceIds: ["a", "b"], reason: "conflict_equal_rank",
  }]);
});

test("current message override wins ephemerally and is explainable", () => {
  const historical = preference("historical", { value: "direct" });
  const result = resolvePreferences({
    preferences: [historical], context,
    currentOverride: { key: "resume.tone", value: "restrained" }, now: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(result.applied[0]?.value, "restrained");
  assert.equal(result.applied[0]?.reason, "current_turn_override");
  assert.match(result.applied[0]?.preferenceId ?? "", /^current-turn:/u);
  assert.equal(result.overridden[0]?.preferenceId, "historical");
  assert.equal(result.explainabilitySnapshot.applied[0]?.valueHash, result.applied[0]?.valueHash);
});

test("disabled, deleted, expired, mismatched, and pending suggestion entries never apply", () => {
  const disabled = preference("disabled", { status: "disabled" });
  const deleted = preference("deleted", { deletedAt: "2026-01-10T00:00:00.000Z" });
  const expired = preference("expired", { expiresAt: "2026-01-15T00:00:00.000Z" });
  const mismatched = preference("mismatched", { scope: { kind: "resume", targetFingerprint: "c".repeat(64) } });
  const pending = {
    version: 1, id: "suggestion-1", ownerId: "user-1",
    sessionId: "session-A", turnId: "turn-1", actionId: "action-1", eventIds: ["event-1"],
    patternHash: "f".repeat(64), key: "resume.tone", proposedValue: "restrained",
    scope: { kind: "global" }, conflictGroup: "resume.tone",
    observationCount: 3, observationActionCount: 2,
    observationWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" },
    confidence: "strong", rationale: {
      code: "repeated_edit_pattern", referenceHashes: ["c".repeat(64)],
    }, createdAt: "2026-01-20T00:00:00.000Z", lastPresentedAt: null,
    expiresAt: "2026-03-01T00:00:00.000Z", state: "pending", ruleVersion: "resume-tone-v1",
  } as never;
  const pendingEvidenceResolver = {
    resolve: (hash: string) => hash === "c".repeat(64) ? {
      referenceHash: hash, ownerId: "user-1", sessionId: "session-A",
      turnId: "turn-1", actionId: "action-1", eventId: "event-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    } : null,
  };
  const result = resolvePreferences({
    preferences: [disabled, deleted, expired, mismatched], suggestions: [pending], context,
    now: "2026-02-01T00:00:00.000Z", evidenceResolver: pendingEvidenceResolver,
  });
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.ignored.map((entry) => [entry.preferenceId, entry.reason]), [
    ["deleted", "deleted"], ["disabled", "disabled"], ["expired", "expired"],
    ["mismatched", "scope_not_applicable"], ["suggestion-1", "suggestion_pending"],
  ]);
});

test("resolution ordering, context fingerprint, and selected values are deterministic and immutable", () => {
  const avoid = (id: string) => preference(id, {
    id, key: "resume.avoid_terms", value: ["夸大", "inflated"], conflictGroup: "resume.avoid_terms",
    ruleVersion: "resume-avoid-terms-v1", source: "explicit_user", sourceSuggestionHash: null,
  });
  const inputs = [avoid("z"), avoid("a")];
  const first = resolvePreferences({ preferences: inputs, context, now: "2026-02-01T00:00:00.000Z" });
  const second = resolvePreferences({ preferences: [...inputs].reverse(), context, now: "2026-02-01T00:00:00.000Z" });
  assert.deepEqual(first, second);
  assert.equal(first.resolutionHash, second.resolutionHash);
  assert.equal(first.contextFingerprint, fingerprintPreferenceContext({ ...context }));
  assert.equal(first.applied[0]?.valueHash, first.applied[0] && first.applied[0].valueHash);
  assert.throws(() => (first.applied[0]?.value as string[]).push("mutate"), TypeError);
  assert.throws(() => first.applied.push(first.applied[0]!), TypeError);
});
test("resolution requires an explicit clock and evaluates expiry deterministically", () => {
  assert.throws(() => resolvePreferences({ preferences: [], context } as never), /now/u);
  assert.throws(() => resolvePreferences({
    preferences: [], context, now: "not-a-time",
  }), /now/u);
  const expiring = preference("expiring", { expiresAt: "2026-02-01T00:00:00.000Z" });
  const before = resolvePreferences({
    preferences: [expiring], context, now: "2026-01-31T23:59:59.999Z",
  });
  const atExpiry = resolvePreferences({
    preferences: [expiring], context, now: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(before.applied[0]?.preferenceId, "expiring");
  assert.deepEqual(atExpiry.applied, []);
  assert.deepEqual(atExpiry.ignored, [{ preferenceId: "expiring", reason: "expired" }]);
});
test("resolution rejects foreign and mixed owner inputs", () => {
  const local = preference("local");
  const foreign = preference("foreign", { ownerId: "user-2" });
  assert.throws(() => resolvePreferences({
    preferences: [local, foreign], context, now: "2026-02-01T00:00:00.000Z",
  }), /ownerId/u);
  assert.throws(() => resolvePreferences({
    preferences: [{ ...local, ownerId: undefined } as never], context,
    now: "2026-02-01T00:00:00.000Z",
  }), /ownerId/u);
  const localSuggestion = { id: "local-suggestion", ownerId: "user-1", state: "pending" } as never;
  const foreignSuggestion = { id: "foreign-suggestion", ownerId: "user-2", state: "pending" } as never;
  assert.throws(() => resolvePreferences({
    preferences: [], suggestions: [localSuggestion, foreignSuggestion], context,
    now: "2026-02-01T00:00:00.000Z",
  }), /binding|ownerId/u);
  assert.notEqual(fingerprintPreferenceContext(context), fingerprintPreferenceContext({
    ...context, ownerId: "user-2",
  }));
});
test("session-bound contexts have distinct fingerprints and reject cross-session suggestions", () => {
  const sessionA = {
    ...context, sessionId: "session-A", turnId: "turn-1", actionId: "action-1",
  };
  const sessionB = { ...sessionA, sessionId: "session-B" };
  assert.notEqual(fingerprintPreferenceContext(sessionA), fingerprintPreferenceContext(sessionB));
  const evidenceHash = "c".repeat(64);
  const suggestion = {
    version: 1, id: "session-suggestion", ownerId: "user-1",
    sessionId: "session-A", turnId: "turn-1", actionId: "action-1", eventIds: ["event-1"],
    key: "resume.tone", proposedValue: "restrained", scope: { kind: "resume" },
    conflictGroup: "resume.tone", observationCount: 3, observationActionCount: 2,
    observationWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" },
    confidence: "strong", rationale: {
      code: "repeated_edit_pattern", referenceHashes: [evidenceHash],
    }, createdAt: "2026-01-20T00:00:00.000Z", lastPresentedAt: null,
    expiresAt: "2026-03-01T00:00:00.000Z", state: "pending", ruleVersion: "resume-tone-v1",
  } as never;
  const evidenceResolver = {
    resolve: (hash: string) => hash === evidenceHash ? {
      referenceHash: hash, ownerId: "user-1", sessionId: "session-A",
      turnId: "turn-1", actionId: "action-1", eventId: "event-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    } : null,
  };
  assert.throws(() => resolvePreferences({
    preferences: [], suggestions: [suggestion], context: sessionB,
    now: "2026-02-01T00:00:00.000Z", evidenceResolver,
  } as never), /session|binding/u);
});

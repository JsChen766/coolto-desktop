import assert from "node:assert/strict";
import test from "node:test";

import {
  isPreferenceKey,
  normalizePreferenceValue,
  preferenceKeyDefinition,
} from "../src/preference/key-registry.js";
import {
  normalizePreference,
  normalizePreferenceProposalInput,
  normalizeScope,
  preferenceContentHash,
  preferencePatternHash,
  preferenceValueHash,
  scopeKey,
} from "../src/preference/normalizer.js";
import {
  createPreferenceSuggestion,
  normalizePreferenceSuggestion,
} from "../src/preference/suggestion-types.js";
import {
  activeSuggestionSuppressions,
  createSuggestionSuppression,
  isSuggestionSuppressed,
  rejectPreferenceSuggestion,
  suggestionSuppressionKey,
} from "../src/preference/suppression-store.js";

const scope = { kind: "resume" as const, targetFingerprint: "a".repeat(64) };
const base = {
  version: 1 as const, id: "pref-1", ownerId: "user-1", entityVersion: 1,
  key: "resume.tone" as const, value: "direct", scope, priority: 50,
  conflictGroup: "resume.tone", source: "explicit_user" as const, sourceSuggestionHash: null,
  status: "active" as const, ruleVersion: "resume-tone-v1",
  confirmedAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z", deletedAt: null,
};
const TEST_SUGGESTION_BINDING = {
  ownerId: "user-1", sessionId: "session-A", turnId: "turn-1",
  actionId: "action-1", eventIds: ["event-1"],
};
const TEST_EVIDENCE_RESOLVER = {
  resolve: (referenceHash: string) => /^[0-9a-f]{64}$/u.test(referenceHash) ? {
    referenceHash, ...TEST_SUGGESTION_BINDING,
    eventId: "event-1", expiresAt: "2026-12-31T00:00:00.000Z",
  } : null,
};
const FREE_LIST_KEYS = ["resume.avoid_terms", "job_search.location_priority"] as const;
const SENSITIVE_VALUES = [
  ["email address", "name@example.com"],
  ["international phone", "+1 (415) 555-0132"],
  ["local phone number", "13800138000"],
  ["Bearer token", "Bearer abcdefghijklmnop"],
  ["OpenAI API key", "sk-1234567890123456"],
  ["publishable API key", "pk_live_1234567890abcdef"],
  ["GitHub API token", "ghp_1234567890abcdefghijkl"],
  ["Slack API token", "xoxb-1234567890abcdef"],
  ["Google API key", "AIzaSyA1234567890abcdefghijklmnopqrs"],
  ["AWS access key ID", "AKIAIOSFODNN7EXAMPLE"],
  ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"],
  ["Chinese identity ID", "11010519491231002X"],
  ["US SSN", "123-45-6789"],
  ["passport-like ID", "E12345678"],
] as const;

test("registry is allowlisted, typed, scoped, and sensitive-safe", () => {
  assert.equal(isPreferenceKey("resume.tone"), true);
  assert.equal(isPreferenceKey("free.form"), false);
  assert.equal(preferenceKeyDefinition("resume.tone").conflictGroup, "resume.tone");
  assert.deepEqual(normalizePreferenceValue("resume.avoid_terms", [" inflated ", "夸大"]), ["inflated", "夸大"]);
  assert.throws(() => normalizePreferenceValue("resume.tone", "invented"), /不支持/u);
  assert.throws(() => normalizePreferenceValue("resume.avoid_terms", ["password"]), /敏感/u);
  assert.throws(() => normalizePreferenceValue("job_search.work_mode", "visa"), /敏感|不支持/u);
  assert.throws(() => preferenceKeyDefinition("nope"), /注册表/u);
});
for (const [label, value] of SENSITIVE_VALUES) {
  test(`rejects ${label} in every free-list Preference key`, () => {
    for (const key of FREE_LIST_KEYS) {
      assert.throws(() => normalizePreferenceValue(key, [value]), /敏感/u);
    }
  });
}
test("benign sensitive-looking values remain accepted in every free-list key", () => {
  const benign = ["skilledcommunication", "phonebook", "emailing", "123 Main Street"];
  for (const key of FREE_LIST_KEYS) {
    for (const value of benign) assert.deepEqual(normalizePreferenceValue(key, [value]), [value]);
  }
});

test("scope normalization enforces canonical encoding and mutually exclusive modifiers", () => {
  assert.equal(scopeKey({ kind: "global" }), "global");
  assert.equal(scopeKey({ kind: "resume", targetFingerprint: "a".repeat(64) }), `resume:${"a".repeat(64)}`);
  assert.equal(scopeKey({ kind: "browser_fill", domain: "EXAMPLE.COM" }), "browser_fill:example.com");
  assert.throws(() => normalizeScope({ kind: "global", domain: "x.test" }), /不允许/u);
  assert.throws(() => normalizeScope({ kind: "resume", targetFingerprint: "A".repeat(64) }), /小写/u);
  assert.throws(() => normalizeScope({ kind: "browser_fill", domain: "https://example.com" }), /精确 host/u);
  assert.throws(() => normalizeScope({ kind: "resume", domain: "example.com" }), /只有 browser_fill/u);
});

test("Preference normalization derives immutable hashes and rejects caller tampering", () => {
  const first = normalizePreference(base);
  const second = normalizePreference({ ...base, value: " direct " });
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(preferenceValueHash(first.value, first.key), preferenceValueHash(" direct ", first.key));
  assert.equal(preferenceContentHash({ ...base, value: "direct" }), first.contentHash);
  const withExpiry = normalizePreference({
    ...base, expiresAt: "2026-02-01T00:00:00.000Z",
  });
  assert.equal(withExpiry.contentHash, first.contentHash);
  const hashWithExcludedMetadata = {
    ...base, sourceSuggestionHash: "c".repeat(64), expiresAt: "2026-03-01T00:00:00.000Z",
  };
  assert.equal(preferenceContentHash(hashWithExcludedMetadata), first.contentHash);
  assert.equal(preferencePatternHash(first.key, first.value, first.scope), preferencePatternHash(first.key, "direct", first.scope));
  assert.throws(() => normalizePreference({ ...base, contentHash: "b".repeat(64) }), /contentHash/u);
  assert.throws(() => normalizePreference({ ...base, source: "behavior_confirmed", sourceSuggestionHash: null }), /provenance/u);
  assert.throws(() => normalizePreference({ ...base, conflictGroup: "caller-choice" }), /registry/u);
});
test("behavior-confirmed provenance must be the normalized suggestion pattern", () => {
  const patternHash = preferencePatternHash(base.key, base.value, base.scope);
  const confirmed = normalizePreference({
    ...base, source: "behavior_confirmed", sourceSuggestionHash: patternHash,
  });
  assert.equal(confirmed.source, "behavior_confirmed");
  assert.equal(confirmed.sourceSuggestionHash, patternHash);
  assert.throws(() => normalizePreference({
    ...base, source: "behavior_confirmed", sourceSuggestionHash: "b".repeat(64),
  }), /pattern/u);
});

test("proposal input validates action snapshots, lifecycle actions, and owner binding", () => {
  const proposal = normalizePreferenceProposalInput({
    action: "update", ownerId: "user-1", preferenceId: "pref-1", expectedEntityVersion: 1, preference: base,
  });
  assert.equal(proposal.preference?.id, "pref-1");
  const created = normalizePreferenceProposalInput({
    action: "create", ownerId: "user-1", preference: base,
  });
  assert.equal(created.expectedEntityVersion, null);
  assert.throws(() => normalizePreferenceProposalInput({
    action: "create", ownerId: "user-1", expectedEntityVersion: 1, preference: base,
  }), /expectedEntityVersion/u);
  assert.throws(() => normalizePreferenceProposalInput({
    action: "update", ownerId: "user-1", preferenceId: "pref-1", preference: base,
  }), /expectedEntityVersion/u);
  assert.throws(() => normalizePreferenceProposalInput({
    action: "update", ownerId: "user-1", preferenceId: "other", expectedEntityVersion: 1, preference: base,
  }), /不匹配/u);
  assert.throws(() => normalizePreferenceProposalInput({
    action: "disable", ownerId: "user-1", preferenceId: "pref-1", expectedEntityVersion: 1,
    preference: base,
  }), /disabled/u);
  const disabled = normalizePreferenceProposalInput({
    action: "disable", ownerId: "user-1", preferenceId: "pref-1", expectedEntityVersion: 1,
    preference: { ...base, status: "disabled" },
  });
  assert.equal(disabled.preference?.status, "disabled");
  assert.throws(() => normalizePreferenceProposalInput({
    action: "delete", ownerId: "user-1", preferenceId: "pref-1", expectedEntityVersion: 1, preference: base,
  }), /replacement/u);
  assert.throws(() => normalizePreferenceProposalInput({
    action: "update", ownerId: "user-2", preferenceId: "pref-1", expectedEntityVersion: 1, preference: base,
  }), /ownerId/u);
});
test("delete rejects missing preferenceId before version checks", () => {
  assert.throws(() => normalizePreferenceProposalInput({
    action: "delete", ownerId: "user-1", expectedEntityVersion: 1,
  }), /preferenceId/u);
  assert.throws(() => normalizePreferenceProposalInput({
    action: "delete", ownerId: "user-1",
  }), /preferenceId/u);
});
test("delete rejects missing expectedEntityVersion with an ID", () => {
  assert.throws(() => normalizePreferenceProposalInput({
    action: "delete", ownerId: "user-1", preferenceId: "pref-1",
  }), /expectedEntityVersion/u);
});

test("pending suggestions are typed, thresholded, and never represented as active Preferences", () => {
  const suggestion = createPreferenceSuggestion({
    id: "suggestion-1", ...TEST_SUGGESTION_BINDING, key: "resume.tone", proposedValue: "restrained",
    scope, observationCount: 3, observationActionCount: 2,
    observationWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" },
    confidence: "strong", rationale: {
      code: "repeated_edit_pattern", referenceHashes: ["d".repeat(64)],
    }, createdAt: "2026-01-20T00:00:00.000Z",
    expiresAt: "2026-02-01T00:00:00.000Z",
  }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z");
  assert.equal(suggestion.state, "pending");
  assert.match(suggestion.patternHash, /^[0-9a-f]{64}$/u);
  assert.throws(() => normalizePreferenceSuggestion({
    ...suggestion, patternHash: "c".repeat(64), state: "pending",
  }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z"), /patternHash/u);
  assert.throws(() => createPreferenceSuggestion({
    ...suggestion, observationCount: 2, observationActionCount: 2,
  }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z"), /至少三次/u);
  for (const raw of ["raw aggregate transcript", "name@example.com", "Bearer abcdefghijklmnop"]) {
    assert.throws(() => normalizePreferenceSuggestion({
      ...suggestion, rationale: raw,
    }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z"), /rationale/u);
  }
  assert.throws(() => normalizePreferenceSuggestion({
    ...suggestion, rationale: {
      code: "free_text", referenceHashes: ["d".repeat(64)],
    },
  }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z"), /code/u);
  assert.throws(() => normalizePreferenceSuggestion({
    ...suggestion, rationale: {
      code: "repeated_edit_pattern", referenceHashes: ["raw"],
    },
  }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z"), /无效/u);
  assert.throws(() => normalizePreferenceSuggestion({
    ...suggestion, observationActionCount: undefined,
  }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z"), /observationActionCount/u);
});

test("rejection suppression is owner-scoped, bounded, and expires without mutating suggestion", () => {
  const suggestion = createPreferenceSuggestion({
    id: "suggestion-2", ...TEST_SUGGESTION_BINDING, key: "resume.tone", proposedValue: "restrained", scope,
    observationCount: 3, observationActionCount: 2,
    observationWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" },
    confidence: "possible", rationale: {
      code: "repeated_edit_pattern", referenceHashes: ["d".repeat(64)],
    }, createdAt: "2026-01-20T00:00:00.000Z",
    expiresAt: "2026-02-01T00:00:00.000Z",
  }, TEST_EVIDENCE_RESOLVER, "2026-01-20T00:00:00.000Z");
  const rejection = {
    ...TEST_SUGGESTION_BINDING, rejectedAt: "2026-01-21T00:00:00.000Z",
  };
  const suppression = createSuggestionSuppression(
    suggestion, rejection, TEST_EVIDENCE_RESOLVER, "2026-01-21T00:00:00.000Z",
  );
  assert.equal(isSuggestionSuppressed(
    suggestion, [suppression], "2026-02-01T00:00:00.000Z", TEST_EVIDENCE_RESOLVER,
  ), true);
  assert.equal(isSuggestionSuppressed(
    suggestion, [suppression], "2026-04-22T00:00:00.000Z", TEST_EVIDENCE_RESOLVER,
  ), false);
  assert.throws(() => isSuggestionSuppressed(
    suggestion, [{ ...suppression, expiresAt: "not-a-time" }], "2026-01-22T00:00:00.000Z",
    TEST_EVIDENCE_RESOLVER,
  ), /expiresAt/u);
  const nonPending = { ...suggestion, state: "rejected" as const };
  for (const expiresAt of ["not-a-time", Date.parse("2026-03-01T00:00:00.000Z")] as const) {
    assert.throws(() => isSuggestionSuppressed(
      nonPending, [{ ...suppression, expiresAt } as never], "2026-01-22T00:00:00.000Z",
      TEST_EVIDENCE_RESOLVER,
    ), /expiresAt/u);
  }
  assert.throws(() => activeSuggestionSuppressions(
    TEST_SUGGESTION_BINDING, [{ ...suppression, expiresAt: Date.parse("2026-03-01T00:00:00.000Z") } as never],
    "2026-01-22T00:00:00.000Z", TEST_EVIDENCE_RESOLVER,
  ), /expiresAt/u);
  for (const expiresAt of [
    "2026-02-30T00:00:00Z",
    "2026-03-01T24:00:00Z",
    "2026-03-01T00:00:00+24:00",
    "2026-03-01T00:00:00+01:60",
  ]) {
    assert.throws(() => activeSuggestionSuppressions(
      TEST_SUGGESTION_BINDING, [{ ...suppression, expiresAt }],
      "2026-01-22T00:00:00.000Z", TEST_EVIDENCE_RESOLVER,
    ), /expiresAt|RFC3339/iu);
  }
  const validExpiryControl = {
    ...suppression, suppressedAt: "2024-02-28T00:00:00Z",
    expiresAt: "2024-02-29T00:00:00+08:00",
  };
  assert.deepEqual(activeSuggestionSuppressions(
    TEST_SUGGESTION_BINDING, [validExpiryControl], "2024-02-28T12:00:00Z",
    TEST_EVIDENCE_RESOLVER,
  ), [validExpiryControl]);

  assert.deepEqual(activeSuggestionSuppressions(
    TEST_SUGGESTION_BINDING, [suppression], "2026-01-22T00:00:00.000Z", TEST_EVIDENCE_RESOLVER,
  ), [suppression]);
  assert.throws(() => activeSuggestionSuppressions(
    TEST_SUGGESTION_BINDING, [{ ...suppression, ownerId: "user-2" }],
    "2026-01-22T00:00:00.000Z", TEST_EVIDENCE_RESOLVER,
  ), /binding|ownerId/u);
  assert.throws(() => isSuggestionSuppressed(
    suggestion, [{ ...suppression, ownerId: "user-2" }], "2026-01-22T00:00:00.000Z",
    TEST_EVIDENCE_RESOLVER,
  ), /binding|ownerId/u);
  const rejected = rejectPreferenceSuggestion(
    suggestion, rejection, TEST_EVIDENCE_RESOLVER, "2026-01-21T00:00:00.000Z",
  );
  assert.equal(rejected.suggestion.state, "rejected");
  assert.equal(suggestion.state, "pending");
  assert.equal(suggestionSuppressionKey(suppression), suggestionSuppressionKey(rejected.suppression));
  assert.throws(() => createSuggestionSuppression(
    suggestion, { ...rejection, ttlDays: 91 }, TEST_EVIDENCE_RESOLVER, "2026-01-21T00:00:00.000Z",
  ), /90/u);
});
test("behavior-derived evidence is bound to owner, session, action, and event", () => {
  const now = "2026-02-01T00:00:00.000Z";
  const registeredHash = "c".repeat(64);
  const expiredHash = "d".repeat(64);
  const evidenceByHash = new Map<string, Record<string, unknown>>([
    [registeredHash, {
      referenceHash: registeredHash, ownerId: "user-1", sessionId: "session-A",
      turnId: "turn-1", actionId: "action-1", eventId: "event-1",
      expiresAt: "2026-12-31T00:00:00.000Z",
    }],
    [expiredHash, {
      referenceHash: expiredHash, ownerId: "user-1", sessionId: "session-A",
      turnId: "turn-1", actionId: "action-1", eventId: "event-1",
      expiresAt: "2026-01-01T00:00:00.000Z",
    }],
  ]);
  const evidenceResolver = { resolve: (hash: string) => evidenceByHash.get(hash) ?? null };
  const draft = {
    version: 1, id: "suggestion-bound", ownerId: "user-1",
    sessionId: "session-A", turnId: "turn-1", actionId: "action-1", eventIds: ["event-1"],
    key: "resume.tone", proposedValue: "restrained",
    patternHash: preferencePatternHash("resume.tone", "restrained", scope, "resume-tone-v1"),
    scope,
    conflictGroup: "resume.tone", observationCount: 3, observationActionCount: 2,
    observationWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" },
    confidence: "strong", rationale: {
      code: "repeated_edit_pattern", referenceHashes: [registeredHash],
    }, createdAt: "2026-01-20T00:00:00.000Z",
    lastPresentedAt: null, expiresAt: "2026-03-01T00:00:00.000Z",
    state: "pending", ruleVersion: "resume-tone-v1",
  };
  const normalizeSuggestion = normalizePreferenceSuggestion as unknown as (...args: unknown[]) => unknown;
  assert.doesNotThrow(() => normalizeSuggestion(draft, evidenceResolver, now));
  const cases: Array<[string, string, Record<string, unknown>]> = [
    ["unknown hash", "f".repeat(64), {}],
    ["foreign owner", registeredHash, { ownerId: "user-2" }],
    ["cross-session", registeredHash, { sessionId: "session-B" }],
    ["wrong action", registeredHash, { actionId: "action-2" }],
    ["wrong event", registeredHash, { eventIds: ["event-2"] }],
    ["expired evidence", expiredHash, {}],
  ];
  for (const [label, hash, overrides] of cases) {
    assert.throws(() => normalizeSuggestion({
      ...draft, ...overrides, rationale: {
        ...draft.rationale, referenceHashes: [hash],
      },
    }, evidenceResolver, now), new RegExp(label.split(" ")[0] + "|evidence|reference|binding", "iu"));
  }
  const createSuppression = createSuggestionSuppression as unknown as (...args: unknown[]) => unknown;
  const isSuppressed = isSuggestionSuppressed as unknown as (...args: unknown[]) => unknown;
  const suppression = createSuppression(draft, {
    ownerId: "user-1", sessionId: "session-A", turnId: "turn-1", actionId: "action-1",
    eventIds: ["event-1"], rejectedAt: now,
  }, evidenceResolver, now);
  assert.throws(() => isSuppressed({
    ...draft, sessionId: "session-B",
  }, [suppression], now, evidenceResolver), /session|binding|owner/u);
});
test("suggestion reads require host clock and persistent suppression evidence", () => {
  const currentNow = "2026-02-01T00:00:00.000Z";
  const evidenceHash = "d".repeat(64);
  const staleEvidenceResolver = {
    resolve: (hash: string) => hash === evidenceHash ? {
      referenceHash: hash, ...TEST_SUGGESTION_BINDING,
      eventId: "event-1", expiresAt: "2026-01-25T00:00:00.000Z",
    } : null,
  };
  const knownEvidenceResolver = {
    resolve: (hash: string) => hash === "d".repeat(64) ? {
      referenceHash: hash, ...TEST_SUGGESTION_BINDING,
      eventId: "event-1", expiresAt: "2026-12-31T00:00:00.000Z",
    } : null,
  };
  const draft = {
    version: 1 as const, id: "clock-required", ...TEST_SUGGESTION_BINDING, key: "resume.tone" as const,
    proposedValue: "restrained", scope, conflictGroup: "resume.tone", ruleVersion: "resume-tone-v1",
    observationCount: 3, observationActionCount: 2,
    observationWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-20T00:00:00.000Z" },
    confidence: "strong" as const,
    rationale: { code: "repeated_edit_pattern" as const, referenceHashes: [evidenceHash] },
    createdAt: "2026-01-20T00:00:00.000Z", lastPresentedAt: null,
    expiresAt: "2026-03-01T00:00:00.000Z", state: "pending" as const,
  };
  const normalizeSuggestion = normalizePreferenceSuggestion as unknown as (...args: unknown[]) => unknown;
  const createSuggestion = createPreferenceSuggestion as unknown as (...args: unknown[]) => unknown;
  assert.throws(() => normalizeSuggestion(draft, staleEvidenceResolver), /now|clock/iu);
  assert.throws(() => createSuggestion(draft, staleEvidenceResolver), /now|clock/iu);
  assert.throws(() => normalizeSuggestion(draft, staleEvidenceResolver, currentNow), /evidence|expired/u);
  for (const expiresAt of [
    "2026-02-30T00:00:00Z",
    "2026-03-01T24:00:00Z",
    "2026-12-31T00:00:00+24:00",
    "2026-12-31T00:00:00+01:60",
  ]) {
    const invalidEvidenceResolver = {
      resolve: () => ({
        referenceHash: evidenceHash, ...TEST_SUGGESTION_BINDING,
        eventId: "event-1", expiresAt,
      }),
    };
    assert.throws(() => normalizeSuggestion(draft, invalidEvidenceResolver, currentNow), /evidence|expiresAt|RFC3339/iu);
  }
  const validEvidenceResolver = {
    resolve: () => ({
      referenceHash: evidenceHash, ...TEST_SUGGESTION_BINDING,
      eventId: "event-1", expiresAt: "2024-02-29T00:00:00+08:00",
    }),
  };
  assert.doesNotThrow(() => normalizeSuggestion({
    ...draft,
    createdAt: "2024-02-01T00:00:00Z",
    expiresAt: "2024-03-01T00:00:00Z",
    observationWindow: { from: "2024-02-01T00:00:00Z", to: "2024-02-20T00:00:00Z" },
  }, validEvidenceResolver, "2024-02-28T12:00:00Z"));


  const suggestion = createPreferenceSuggestion({
    ...draft, rationale: { code: "repeated_edit_pattern", referenceHashes: ["d".repeat(64)] },
  }, knownEvidenceResolver, "2026-01-20T00:00:00.000Z");
  const suppressionInput = {
    ...TEST_SUGGESTION_BINDING, rejectedAt: "2026-01-21T00:00:00.000Z",
  };
  const createSuppression = createSuggestionSuppression as unknown as (...args: unknown[]) => unknown;
  assert.throws(() => createSuppression(suggestion, suppressionInput, knownEvidenceResolver), /now|clock/iu);
  const suppression = createSuggestionSuppression(
    suggestion, suppressionInput, knownEvidenceResolver, "2026-01-21T00:00:00.000Z",
  );
  assert.match(suppression.patternAuthorityHash, /^[0-9a-f]{64}$/u);
  assert.doesNotThrow(() => createSuggestionSuppression(
    suggestion, suppressionInput, knownEvidenceResolver, Date.parse("2026-01-21T00:00:00.000Z"),
  ));
  const numericRejection = {
    ...suppressionInput, rejectedAt: Date.parse("2026-01-21T00:00:00.000Z"),
  } as never;
  assert.throws(() => createSuppression(
    suggestion, numericRejection, knownEvidenceResolver, "2026-01-21T00:00:00.000Z",
  ), /rejectedAt|RFC3339/u);
  assert.throws(() => rejectPreferenceSuggestion(
    suggestion, numericRejection, knownEvidenceResolver, "2026-01-21T00:00:00.000Z",
  ), /rejectedAt|RFC3339/u);
  const invalidCalendarRejection = {
    ...suppressionInput, rejectedAt: "2026-02-30T00:00:00Z",
  } as never;
  assert.throws(() => createSuppression(
    suggestion, invalidCalendarRejection, knownEvidenceResolver, "2026-02-01T00:00:00.000Z",
  ), /rejectedAt|RFC3339/u);
  assert.throws(() => rejectPreferenceSuggestion(
    suggestion, invalidCalendarRejection, knownEvidenceResolver, "2026-02-01T00:00:00.000Z",
  ), /rejectedAt|RFC3339/u);
  const forgedPatternHash = { ...suppression, patternHash: "f".repeat(64) };
  const forgedReferenceHash = { ...suppression, referenceHashes: ["f".repeat(64)] };
  const active = activeSuggestionSuppressions as unknown as (...args: unknown[]) => unknown;
  const suppressed = isSuggestionSuppressed as unknown as (...args: unknown[]) => unknown;
  const assertReadRejects = (
    entry: unknown,
    resolver: unknown,
    pattern = /evidence|reference|resolver|binding|owner|session|turn|action|event|expiry/iu,
  ) => {
    assert.throws(() => active(TEST_SUGGESTION_BINDING, [entry], currentNow, resolver), pattern);
    assert.throws(() => suppressed(suggestion, [entry], currentNow, resolver), pattern);
  };
  assertReadRejects(forgedPatternHash, knownEvidenceResolver, /patternHash|authority/iu);
  assertReadRejects(forgedReferenceHash, knownEvidenceResolver);
  for (const [field, value] of [
    ["ownerId", "user-2"], ["sessionId", "session-B"], ["turnId", "turn-2"],
    ["actionId", "action-2"], ["eventIds", ["event-2"]],
  ] as const) {
    assertReadRejects({ ...suppression, [field]: value }, knownEvidenceResolver);
  }
  for (const [label, evidence] of [
    ["wrong referenceHash", { referenceHash: "e".repeat(64) }],
    ["wrong owner", { ownerId: "user-2" }],
    ["wrong session", { sessionId: "session-B" }],
    ["wrong turn", { turnId: "turn-2" }],
    ["wrong action", { actionId: "action-2" }],
    ["wrong event", { eventId: "event-2" }],
    ["expired evidence", { expiresAt: "2026-01-01T00:00:00.000Z" }],
    ["numeric evidence expiry", { expiresAt: Date.parse("2026-12-31T00:00:00.000Z") }],
  ] as const) {
    const resolver = {
      resolve: () => Object.assign({
        referenceHash: "d".repeat(64), ...TEST_SUGGESTION_BINDING,
        eventId: "event-1", expiresAt: "2026-12-31T00:00:00.000Z",
      }, evidence),
    };
    assertReadRejects(suppression, resolver, new RegExp(label.split(" ")[0] + "|evidence|reference|expiry", "iu"));
  }
  assert.deepEqual(active(
    TEST_SUGGESTION_BINDING, [{ ...suppression, expiresAt: "2026-01-22T00:00:00.000Z" }],
    currentNow, knownEvidenceResolver,
  ), []);
  assert.equal(suppressed(
    suggestion, [{ ...suppression, expiresAt: "2026-01-22T00:00:00.000Z" }],
    currentNow, knownEvidenceResolver,
  ), false);
  assert.throws(() => active(
    TEST_SUGGESTION_BINDING, [{
      ...suppression, suppressedAt: "2026-03-01T00:00:00.000Z", expiresAt: "2026-04-01T00:00:00.000Z",
    }],
    currentNow, knownEvidenceResolver,
  ), /suppressedAt|now/u);
  assertReadRejects(
    { ...suppression, suppressedAt: "2026-02-30T00:00:00Z" } as never,
    knownEvidenceResolver, /suppressedAt|RFC3339/iu,
  );
  assertReadRejects(
    { ...suppression, suppressedAt: Date.parse("2026-01-21T00:00:00.000Z") } as never,
    knownEvidenceResolver, /suppressedAt|RFC3339/iu,
  );
  assert.throws(() => active(
    TEST_SUGGESTION_BINDING, [{ ...suppression, expiresAt: Date.parse("2026-03-01T00:00:00.000Z") }],
    currentNow, knownEvidenceResolver,
  ), /expiresAt/u);
});

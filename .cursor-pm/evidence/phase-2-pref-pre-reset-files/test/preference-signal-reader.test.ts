import assert from "node:assert/strict";
import test from "node:test";

import {
  signalToSuggestion,
  type PreferenceAggregateSignalV1,
} from "../src/agent-task/preference-signal-reader.js";

const baseSignal: PreferenceAggregateSignalV1 = {
  version: 1, ownerId: "owner", sessionId: "session", turnId: "turn", actionId: "action",
  eventIds: ["event-1", "event-2", "event-3"], referenceHashes: ["a".repeat(64)],
  key: "resume.tone", proposedValue: "restrained", scope: { kind: "resume" },
  observationCount: 3, observationActionCount: 2,
  observationWindow: { from: "2026-01-01T00:00:00.000Z", to: "2026-01-30T00:00:00.000Z" },
  confidence: "strong", rationaleCode: "repeated_edit_pattern",
  createdAt: "2026-01-30T00:00:00.000Z", expiresAt: "2026-04-30T00:00:00.000Z",
};
const reader = {
  readAggregateSignals: async () => [],
  evidenceResolver: () => ({ resolve: (hash: string) => ({
    referenceHash: hash, ownerId: "owner", sessionId: "session", turnId: "turn",
    actionId: "action", eventId: "event-1", expiresAt: "2026-04-30T00:00:00.000Z",
  }) }),
};

test("ANA suggestion identity changes with a materially different scope", () => {
  const first = signalToSuggestion(baseSignal, reader, "2026-02-01T00:00:00.000Z");
  const second = signalToSuggestion({
    ...baseSignal, scope: { kind: "resume", targetFingerprint: "b".repeat(64) },
  }, reader, "2026-02-01T00:00:00.000Z");
  assert.notEqual(first.id, second.id);
  assert.match(first.id, /^suggestion-[0-9a-f]{64}$/u);
  assert.ok(first.id.length <= 128);
  assert.notEqual(first.patternHash, second.patternHash);
});

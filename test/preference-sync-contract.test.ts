import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSyncPage, normalizeSyncPushResult } from "../src/api/sync-normalizers.js";
import { createPreferenceSnapshot, toPreferenceMutationPayload } from "../src/desktop/main/preference/preference-sync-mapping.js";

const preference = createPreferenceSnapshot("owner-1", "pref-1", {
  key: "resume.tone", value: "restrained", scope: { kind: "global" }, priority: 50,
}, "2026-01-01T00:00:00.000Z");

test("Preference mutations use the strict backend business payload", () => {
  const payload = toPreferenceMutationPayload(preference, "owner-1");
  assert.deepEqual(Object.keys(payload).sort(), [
    "conflictGroup", "key", "ownerId", "priority", "ruleVersion", "scope",
    "source", "sourceSuggestionHash", "status", "value", "version",
  ]);
  assert.equal("id" in payload, false);
  assert.equal("entityVersion" in payload, false);
  assert.equal("contentHash" in payload, false);
  assert.equal(payload.ownerId, "owner-1");
});

test("Sync normalizers accept Preference bootstrap, pull, and push results", () => {
  const page = normalizeSyncPage({
    changes: [{
      entityType: "user_preference", entityId: "pref-1", entityVersion: 1,
      operation: "upsert", changedAt: "2026-01-01T00:00:00.000Z",
      payload: preference,
    }], nextCursor: "cursor-1", hasMore: false, serverTime: "2026-01-01T00:00:00.000Z",
  });
  const push = normalizeSyncPushResult({
    results: [{ operationId: "op-1", status: "applied", entityId: "pref-1",
      appliedVersion: 1, errorCode: null, serverEntity: preference }],
    serverTime: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(page.changes[0]?.entityType, "user_preference");
  assert.equal(push.results[0]?.appliedVersion, 1);
});

test("Sync normalizers reject unknown entity types instead of widening the boundary", () => {
  assert.throws(() => normalizeSyncPage({
    changes: [{ entityType: "user_preference_feedback", entityId: "x", entityVersion: 1,
      operation: "upsert", changedAt: "now", payload: {} }],
    nextCursor: "cursor", hasMore: false, serverTime: "now",
  }), /unsupported/u);
});

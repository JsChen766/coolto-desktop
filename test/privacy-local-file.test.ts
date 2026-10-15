import assert from "node:assert/strict";
import test from "node:test";

import { parseStoredPrivacyFile } from "../src/desktop/main/privacy/privacy-local-file.js";

const origin = "http://127.0.0.1:8080";
const entry = {
  policyVersion: "privacy-2026-09-08-v1",
  contentHash: "a".repeat(64),
  status: "accepted" as const,
  acceptedAt: "2026-09-08T00:00:00Z",
  decisionAt: "2026-09-08T00:00:00Z",
};

test("valid privacy cache for the current API origin is kept", () => {
  const file = parseStoredPrivacyFile({
    version: 1,
    apiBaseUrl: origin,
    entries: { anonymous: entry },
  }, origin);
  assert.equal(file?.entries.anonymous?.status, "accepted");
});

test("privacy cache from another origin or broken payload is discarded", () => {
  assert.equal(parseStoredPrivacyFile({
    version: 1,
    apiBaseUrl: "http://localhost:8080",
    entries: { anonymous: entry },
  }, origin), undefined);
  assert.equal(parseStoredPrivacyFile({ version: 2, apiBaseUrl: origin, entries: {} }, origin), undefined);
  assert.equal(parseStoredPrivacyFile({ version: 1, apiBaseUrl: origin, entries: { anonymous: { status: "accepted" } } }, origin), undefined);
});

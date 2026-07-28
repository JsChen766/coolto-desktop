import assert from "node:assert/strict";
import test from "node:test";

import { CooltoApiError } from "../src/api/coolto-api-error.js";
import { canRestoreOffline } from "../src/auth/offline-session.js";

const cachedUser = {
  id: "user-1",
  email: "user@example.com",
  deviceId: "device-1",
} as const;

test("cached desktop identity permits startup on fetch failure", () => {
  assert.equal(canRestoreOffline(new TypeError("fetch failed"), cachedUser), true);
  assert.equal(
    canRestoreOffline(new DOMException("timed out", "TimeoutError"), cachedUser),
    true,
  );
});

test("offline restore never masks auth or server failures", () => {
  assert.equal(
    canRestoreOffline(new CooltoApiError("unauthorized", 401), cachedUser),
    false,
  );
  assert.equal(canRestoreOffline(new Error("unexpected"), cachedUser), false);
  assert.equal(
    canRestoreOffline(new TypeError("fetch failed"), {
      id: "user-1",
      email: "user@example.com",
    }),
    false,
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { AuthPrivacyCoordinator } from "../src/desktop/main/auth-helpers.js";
import type { CurrentUser } from "../src/api/types.js";
import type { PrivacyService } from "../src/desktop/main/privacy/privacy-service.js";

const user: CurrentUser = { id: "user-1", email: "a@example.com", deviceId: "device-1" };

function fakePrivacy(allowed: boolean, serverVerified = allowed) {
  return {
    isServerConsentVerified: serverVerified,
    prepareForUser: async () => allowed,
    setRestrictedRecovery: () => undefined,
  } as unknown as PrivacyService;
}

function coordinator(privacy: PrivacyService, events: string[]) {
  return new AuthPrivacyCoordinator({
    privacy,
    saveSession: async () => { events.push("session-saved"); },
    setCurrentUser: () => { events.push("user-set"); },
    startSync: async (_user, network) => { events.push(network ? "network-sync" : "local-sync"); },
    isRestrictedRecovery: async () => false,
  });
}

test("auth activation starts no business sync before consent", async () => {
  const events: string[] = [];
  await coordinator(fakePrivacy(false), events).activate(user, true);
  assert.deepEqual(events, ["session-saved", "user-set"]);
});

test("auth activation starts verified network sync only after consent", async () => {
  const events: string[] = [];
  await coordinator(fakePrivacy(true), events).activate(user, true);
  assert.deepEqual(events, ["session-saved", "user-set", "network-sync"]);
});
test("offline cached consent does not start a local Sync runtime", async () => {
  const events: string[] = [];
  await coordinator(fakePrivacy(true, false), events).activate(user, false);
  assert.deepEqual(events, ["session-saved", "user-set"]);
});

test("restricted recovery prevents user services before deletion recovery", async () => {
  const events: string[] = [];
  const privacy = fakePrivacy(true);
  const gate = new AuthPrivacyCoordinator({
    privacy,
    saveSession: async () => { events.push("session-saved"); },
    setCurrentUser: () => { events.push("user-set"); },
    startSync: async () => { events.push("sync"); },
    isRestrictedRecovery: async () => true,
  });
  await gate.activate(user, true);
  assert.deepEqual(events, ["session-saved", "user-set"]);
});
test("pending-deletion account status never activates sync", async () => {
  const events: string[] = [];
  await coordinator(
    fakePrivacy(true),
    events,
  ).activate({ ...user, status: "pending_deletion" }, false);
  assert.deepEqual(events, ["session-saved", "user-set"]);
});

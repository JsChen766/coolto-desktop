import assert from "node:assert/strict";
import test from "node:test";
import { CooltoApiError } from "../src/api/coolto-api-error.js";
import { AuthPrivacyCoordinator } from "../src/desktop/main/auth-helpers.js";

import { PrivacyService, type PrivacyLocalStatePort } from "../src/desktop/main/privacy/privacy-service.js";
import { BUNDLED_PRIVACY_POLICY } from "../src/privacy/policy.js";
import type { PrivacyApi } from "../src/api/privacy-api.js";
import type { CachedPrivacyConsent } from "../src/desktop/main/privacy/privacy-local-state.js";

function memoryState(): PrivacyLocalStatePort {
  const entries = new Map<string, CachedPrivacyConsent>();
  return {
    get: async (accountId) => entries.get(accountId ?? "anonymous"),
    set: async (accountId, value) => { entries.set(accountId ?? "anonymous", structuredClone(value)); },
    clear: async (accountId) => { entries.delete(accountId ?? "anonymous"); },
    clearAccountAndAnonymous: async (accountId) => {
      entries.delete(accountId);
      entries.delete("anonymous");
    },
  };
}

function fakeApi() {
  let serverStatus: "accepted" | "required" | "declined" = "required";
  const decisions: string[] = [];
  const api = {
    getPolicy: async () => BUNDLED_PRIVACY_POLICY,
    getConsent: async () => ({
      policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
      status: serverStatus,
      acceptedAt: serverStatus === "accepted" ? "2026-09-08T00:00:00Z" : null,
      decisionAt: "2026-09-08T00:00:00Z",
    }),
    recordConsent: async (input: { decision: string }) => {
      decisions.push(input.decision);
      serverStatus = input.decision === "accept" ? "accepted" : "declined";
      return {
        policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
        status: serverStatus,
        acceptedAt: serverStatus === "accepted" ? "2026-09-08T00:00:00Z" : null,
        decisionAt: "2026-09-08T00:00:00Z",
      };
    },
  };
  return { api: api as unknown as PrivacyApi, decisions };
}

test("pre-login acceptance is local-only until authenticated consent is recorded", async () => {
  const fake = fakeApi();
  const service = new PrivacyService({
    api: fake.api,
    apiBaseUrl: "http://localhost:8000",
    localState: memoryState(),
  });

  const before = await service.getState();
  assert.equal(before.consent, null);
  assert.equal(before.localAccepted, false);
  await service.accept("device-1");
  assert.equal(service.state().localAccepted, true);

  const allowed = await service.prepareForUser(
    { id: "user-1", email: "alice@example.com" },
    "device-1",
  );
  assert.equal(allowed, true);
  assert.deepEqual(fake.decisions, ["accept"]);
});

test("server decline keeps the account gated even after a stale local acceptance", async () => {
  const fake = fakeApi();
  const local = memoryState();
  await local.set("user-1", {
    policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
    contentHash: BUNDLED_PRIVACY_POLICY.contentHash,
    status: "accepted",
    acceptedAt: "2026-09-08T00:00:00Z",
    decisionAt: "2026-09-08T00:00:00Z",
  });
  fake.api = {
    ...fake.api,
    getConsent: async () => ({
      policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
      status: "declined",
      acceptedAt: null,
      decisionAt: "2026-09-08T00:00:00Z",
    }),
  } as unknown as PrivacyApi;
  const service = new PrivacyService({ api: fake.api, apiBaseUrl: "http://localhost:8000", localState: local });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
  assert.equal(service.state().consent?.status, "declined");
  assert.equal(await local.get("user-1"), undefined);
  const offlineApi = {
    ...fake.api,
    getPolicy: async () => { throw new TypeError("fetch failed"); },
    getConsent: async () => { throw new TypeError("fetch failed"); },
  } as unknown as PrivacyApi;
  const restarted = new PrivacyService({
    api: offlineApi,
    apiBaseUrl: "http://localhost:8000",
    localState: local,
  });
  assert.equal(await restarted.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
  assert.equal(restarted.isOfflineLocalOnly, false);
  assert.deepEqual(fake.decisions, []);
});
test("required and withdrawn server decisions clear the owner cache", async () => {
  for (const status of ["required", "withdrawn"] as const) {
    const local = memoryState();
    await local.set("user-1", {
      policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
      contentHash: BUNDLED_PRIVACY_POLICY.contentHash,
      status: "accepted",
      acceptedAt: "2026-09-08T00:00:00Z",
      decisionAt: "2026-09-08T00:00:00Z",
    });
    const api = {
      getPolicy: async () => BUNDLED_PRIVACY_POLICY,
      getConsent: async () => ({
        policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
        status,
        acceptedAt: null,
        decisionAt: "2026-09-08T00:00:00Z",
      }),
    } as unknown as PrivacyApi;
    const service = new PrivacyService({ api, apiBaseUrl: "http://localhost:8000", localState: local });
    assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
    assert.equal(await local.get("user-1"), undefined);
  }
});

test("authenticated decline removes the accepted owner cache", async () => {
  const local = memoryState();
  const fake = fakeApi();
  fake.api = {
    ...fake.api,
    getConsent: async () => ({
      policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
      status: "accepted",
      acceptedAt: "2026-09-08T00:00:00Z",
      decisionAt: "2026-09-08T00:00:00Z",
    }),
  } as unknown as PrivacyApi;
  const service = new PrivacyService({ api: fake.api, apiBaseUrl: "http://localhost:8000", localState: local });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), true);
  assert.ok(await local.get("user-1"));
  await service.decline("device-1");
  assert.equal(await local.get("user-1"), undefined);
});
test("lost authenticated decline response cannot revive the accepted cache", async () => {
  const local = memoryState();
  const api = {
    getPolicy: async () => BUNDLED_PRIVACY_POLICY,
    getConsent: async () => ({
      policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
      status: "accepted" as const,
      acceptedAt: "2026-09-08T00:00:00Z",
      decisionAt: "2026-09-08T00:00:00Z",
    }),
    recordConsent: async () => {
      throw new TypeError("response lost after server commit");
    },
  } as unknown as PrivacyApi;
  const service = new PrivacyService({ api, apiBaseUrl: "http://localhost:8000", localState: local });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), true);
  assert.ok(await local.get("user-1"));
  await assert.rejects(service.decline("device-1"), /response lost/u);
  assert.equal(await local.get("user-1"), undefined);
  const offline = new PrivacyService({
    api: {
      getPolicy: async () => { throw new TypeError("fetch failed"); },
      getConsent: async () => { throw new TypeError("fetch failed"); },
    } as unknown as PrivacyApi,
    apiBaseUrl: "http://localhost:8000",
    localState: local,
  });
  assert.equal(await offline.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
});

test("unsupported remote policy cannot use a cached acceptance", async () => {
  const fake = fakeApi();
  const local = memoryState();
  await local.set(undefined, {
    policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
    contentHash: BUNDLED_PRIVACY_POLICY.contentHash,
    status: "accepted",
    acceptedAt: "2026-09-08T00:00:00Z",
    decisionAt: "2026-09-08T00:00:00Z",
  });
  fake.api = {
    ...fake.api,
    getPolicy: async () => ({
      ...BUNDLED_PRIVACY_POLICY,
      policyVersion: "privacy-2027-01-01-v2",
    }),
  } as unknown as PrivacyApi;
  const service = new PrivacyService({
    api: fake.api,
    apiBaseUrl: "http://localhost:8000",
    localState: local,
  });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
  assert.match(service.state().error ?? "", /升级 Coolto/u);
});

test("unauthorized or malformed consent reads cannot fall back to cached acceptance", async () => {
  const fake = fakeApi();
  const local = memoryState();
  await local.set(undefined, {
    policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
    contentHash: BUNDLED_PRIVACY_POLICY.contentHash,
    status: "accepted",
    acceptedAt: "2026-09-08T00:00:00Z",
    decisionAt: "2026-09-08T00:00:00Z",
  });
  fake.api = {
    ...fake.api,
    getConsent: async () => {
      throw new CooltoApiError("unauthorized", 401, "unauthorized");
    },
  } as unknown as PrivacyApi;
  const service = new PrivacyService({ api: fake.api, apiBaseUrl: "http://localhost:8000", localState: local });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
  assert.equal(service.isBusinessAllowed, false);
});

test("network-only consent failure stays local-only and cannot open business access", async () => {
  const fake = fakeApi();
  const local = memoryState();
  await local.set(undefined, {
    policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
    contentHash: BUNDLED_PRIVACY_POLICY.contentHash,
    status: "accepted",
    acceptedAt: "2026-09-08T00:00:00Z",
    decisionAt: "2026-09-08T00:00:00Z",
  });
  fake.api = {
    ...fake.api,
    getConsent: async () => { throw new TypeError("fetch failed"); },
  } as unknown as PrivacyApi;
  const service = new PrivacyService({ api: fake.api, apiBaseUrl: "http://localhost:8000", localState: local });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), true);
  assert.equal(service.isServerConsentVerified, false);
  assert.equal(service.isOfflineLocalOnly, true);
  assert.equal(service.isBusinessAllowed, false);
  assert.deepEqual(fake.decisions, []);
});

test("missing deployed privacy endpoints fail closed with upgrade-required read-only state", async () => {
  const fake = fakeApi();
  const local = memoryState();
  await local.set(undefined, {
    policyVersion: BUNDLED_PRIVACY_POLICY.policyVersion,
    contentHash: BUNDLED_PRIVACY_POLICY.contentHash,
    status: "accepted",
    acceptedAt: "2026-09-08T00:00:00Z",
    decisionAt: "2026-09-08T00:00:00Z",
  });
  fake.api = {
    ...fake.api,
    getPolicy: async () => {
      throw new CooltoApiError("not found", 404, "not_found");
    },
  } as unknown as PrivacyApi;
  const service = new PrivacyService({
    api: fake.api,
    apiBaseUrl: "http://localhost:8000",
    localState: local,
  });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
  assert.equal(service.isOfflineLocalOnly, false);
  assert.match(service.state().error ?? "", /升级 Coolto/u);
  assert.deepEqual(fake.decisions, []);
});
async function assertUnsupportedPolicy(
  getPolicy: () => Promise<unknown>,
): Promise<void> {
  const calls = {
    consentRead: 0,
    consentWrite: 0,
    exportWrite: 0,
    deletionWrite: 0,
    sync: 0,
  };
  const api = {
    getPolicy,
    getConsent: async () => {
      calls.consentRead += 1;
      throw new Error("consent must not be read");
    },
    recordConsent: async () => {
      calls.consentWrite += 1;
      throw new Error("consent must not be written");
    },
    exportSnapshot: async () => {
      calls.exportWrite += 1;
      throw new Error("export must not be written");
    },
    startDeletion: async () => {
      calls.deletionWrite += 1;
      throw new Error("deletion must not be written");
    },
  } as unknown as PrivacyApi;
  const service = new PrivacyService({
    api,
    apiBaseUrl: "http://localhost:8000",
    localState: memoryState(),
  });
  const coordinator = new AuthPrivacyCoordinator({
    privacy: service,
    saveSession: async () => undefined,
    setCurrentUser: () => undefined,
    startSync: async () => { calls.sync += 1; },
    isRestrictedRecovery: async () => false,
  });
  await coordinator.activate(
    { id: "user-1", email: "a@example.com", deviceId: "device-1" },
    true,
  );
  assert.equal(service.isBusinessAllowed, false);
  assert.throws(() => service.requireBusinessAccess(), /升级 Coolto/u);
  assert.deepEqual(calls, {
    consentRead: 0,
    consentWrite: 0,
    exportWrite: 0,
    deletionWrite: 0,
    sync: 0,
  });
}

test("unsupported policy and old-server 404 deny business access without writes", async () => {
  await assertUnsupportedPolicy(async () => ({
    ...BUNDLED_PRIVACY_POLICY,
    contentHash: "f".repeat(64),
  }));
  await assertUnsupportedPolicy(async () => {
    throw new CooltoApiError("not found", 404, "not_found");
  });
});
test("consent endpoint 404 disables acceptance and business writes", async () => {
  const fake = fakeApi();
  const local = memoryState();
  fake.api = {
    ...fake.api,
    getConsent: async () => {
      throw new CooltoApiError("not found", 404, "not_found");
    },
  } as unknown as PrivacyApi;
  const service = new PrivacyService({
    api: fake.api,
    apiBaseUrl: "http://localhost:8000",
    localState: local,
  });
  assert.equal(await service.prepareForUser({ id: "user-1", email: "a@example.com" }, "device-1"), false);
  assert.equal(service.isFeatureAvailable, false);
  assert.equal(service.isBusinessAllowed, false);
  await assert.rejects(service.accept("device-1"), /升级 Coolto/u);
  assert.deepEqual(fake.decisions, []);
});

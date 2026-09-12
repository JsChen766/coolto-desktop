import assert from "node:assert/strict";
import test from "node:test";

import { PrivacyDeletionService, type PrivacyDeletionApi } from "../src/desktop/main/privacy/privacy-deletion-service.js";
import type { DeletionRecoveryRecord, DeletionRecoveryStorePort } from "../src/desktop/main/privacy/deletion-recovery-store.js";
import type { DeletionRequestView, DeletionStartResponse } from "../src/privacy/types.js";

const awaiting: DeletionRequestView = {
  requestId: "request-1", status: "awaiting_control_ack", retryable: true, steps: [],
  thirdPartyDataUnaffected: true, updatedAt: "2026-09-08T00:00:00Z", completedAt: null,
};
const pending: DeletionRequestView = { ...awaiting, status: "pending_deletion" };
const completed: DeletionRequestView = { ...pending, status: "completed", retryable: false, completedAt: "2026-09-08T00:00:01Z" };
const started: DeletionStartResponse = { ...awaiting, deletionControlToken: "token-1" };

function memoryStore(): DeletionRecoveryStorePort & { value?: DeletionRecoveryRecord } {
  const store: DeletionRecoveryStorePort & { value?: DeletionRecoveryRecord } = {
    newRecord: (confirmationDigest, accountEmail) => ({
      version: 1, apiBaseUrl: "http://test", ownerId: "a", accountEmail, ownerHash: "owner",
      phase: "awaiting_saved", requestId: null,
      startIdempotencyKey: "start-key-012345678901234567890123456789", confirmationDigest, controlToken: null,
      ackIdempotencyKey: "ack-key-012345678901234567890123456789", localWipeComplete: false,
    }),
    load: async () => store.value && structuredClone(store.value),
    save: async (record) => { store.value = structuredClone(record); },
    clear: async () => { delete store.value; },
  };
  return store;
}

function clearLocal(calls: string[]) {
  return async (_ownerId: string, _accountEmail: string) => {
    calls.push("clear-local");
    return { status: "cleared" as const, cloudAssets: "preserved" as const, cleared: ["all"], failed: [] };
  };
}

test("deletion start persists before confirm and never exposes token in state", async () => {
  const calls: string[] = [];
  const store = memoryStore();
  const api: PrivacyDeletionApi = {
    startDeletion: async () => { calls.push("start"); return started; },
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => pending,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api, store, currentUser: () => ({ id: "a", email: "a@example.com" }), clearLocal: clearLocal(calls),
  });
  const state = await service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" });
  assert.deepEqual(calls, ["start", "confirm", "clear-local"]);
  assert.equal(state.status, "pending_deletion");
  assert.equal("controlToken" in state, false);
  assert.equal(store.value?.phase, "confirmed");
});
test("ordinary access stays usable until confirm commits", async () => {
  const calls: string[] = [];
  const store = memoryStore();
  const api: PrivacyDeletionApi = {
    startDeletion: async () => { calls.push("start"); return started; },
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => pending,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
    restrictOrdinaryAccess: () => { calls.push("restrict"); },
  });
  await service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" });
  assert.deepEqual(calls, ["start", "confirm", "restrict", "clear-local"]);
});

test("lost start response reuses owner idempotency and later recovery resumes after confirm crash", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  let startAttempts = 0;
  let confirmAttempts = 0;
  const api: PrivacyDeletionApi = {
    startDeletion: async (_confirmation, key) => {
      calls.push(`start:${key}`);
      startAttempts += 1;
      if (startAttempts === 1) throw new TypeError("network lost");
      return { ...started, deletionControlToken: "token-2" };
    },
    confirmDeletion: async () => {
      confirmAttempts += 1;
      if (confirmAttempts === 1) throw new TypeError("response lost");
      return pending;
    },
    getDeletion: async () => pending,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api, store, currentUser: () => ({ id: "a", email: "a@example.com" }), clearLocal: clearLocal(calls),
  });
  await assert.rejects(service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" }));
  await assert.rejects(service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" }));
  assert.deepEqual(calls.slice(0, 2), [
    "start:start-key-012345678901234567890123456789",
    "start:start-key-012345678901234567890123456789",
  ]);
  assert.equal(store.value?.controlToken, "token-2");
  assert.equal(store.value?.phase, "confirm_sent");
  const recovered = await service.recover();
  assert.equal(recovered.status, "pending_deletion");
  assert.equal(store.value?.localWipeComplete, true);
});

test("account mismatch and terminal ack replay fail closed without cross-account access", async () => {
  const store = memoryStore();
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => pending,
    getDeletion: async () => completed,
    retryDeletion: async () => completed,
    ackDeletion: async (_requestId, token) => {
      if (token) throw new Error("hash already deleted");
      return { requestId: "request-1", status: "acknowledged" };
    },
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "b", email: "b@example.com" }),
    clearLocal: async (_ownerId, _accountEmail) => ({
      status: "cleared",
      cloudAssets: "preserved",
      cleared: [],
      failed: [],
    }),
  });
  await assert.rejects(service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" }), /当前登录账号邮箱/u);
  store.value = {
    ...store.newRecord("digest", "a@example.com"),
    phase: "confirmed",
    requestId: "request-1",
    controlToken: "token-1",
  };
  await assert.rejects(service.recover(), /账号切换期间拒绝删除/u);
  assert.equal(store.value?.phase, "confirmed");
});

test("reopen mismatch prevents confirmation and local wipe", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  const originalSave = store.save;
  let saves = 0;
  store.save = async (record) => {
    saves += 1;
    await originalSave(record);
    if (saves === 2 && store.value) {
      store.value = { ...store.value, requestId: "tampered" };
    }
  };
  const api: PrivacyDeletionApi = {
    startDeletion: async () => { calls.push("start"); return started; },
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => pending,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
  });
  await assert.rejects(
    service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" }),
    /未能重新读取验证/u,
  );
  assert.deepEqual(calls, ["start"]);
  assert.equal(store.value?.phase, "awaiting_saved");
});

test("safe storage failure before start sends no request or wipe", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  store.save = async () => { throw new Error("系统安全存储不可用"); };
  const api: PrivacyDeletionApi = {
    startDeletion: async () => { calls.push("start"); return started; },
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => pending,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
  });
  await assert.rejects(
    service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" }),
    /安全存储不可用/u,
  );
  assert.deepEqual(calls, []);
});
test("crash while persisting the token sends no confirmation or wipe", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  let saves = 0;
  store.save = async (record) => {
    saves += 1;
    if (saves === 2) throw new Error("simulated crash before confirm");
    store.value = structuredClone(record);
  };
  const api: PrivacyDeletionApi = {
    startDeletion: async () => { calls.push("start"); return started; },
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => pending,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
  });
  await assert.rejects(
    service.start({ accountEmail: "a@example.com", confirmation: "DELETE MY ACCOUNT" }),
    /simulated crash before confirm/u,
  );
  assert.deepEqual(calls, ["start"]);
  assert.equal(store.value?.phase, "awaiting_saved");
});
test("pre-confirm expiry stays restartable with the same key", async () => {
  const store = memoryStore();
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "awaiting_saved",
    requestId: "request-1",
    controlToken: "token-1",
  };
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => pending,
    getDeletion: async () => { throw new Error("deletion_control_expired"); },
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal([]),
  });
  const state = await service.recover();
  assert.equal(state.status, "awaiting_control_ack");
  assert.equal(state.retryable, true);
  assert.equal(store.value?.phase, "awaiting_saved");
});
test("retry rotates an expired pre-confirm token with the same idempotency key", async () => {
  const store = memoryStore();
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "awaiting_saved",
    requestId: "request-1",
    controlToken: "token-1",
  };
  const startKey = store.value.startIdempotencyKey;
  const calls: string[] = [];
  let statusCalls = 0;
  const api: PrivacyDeletionApi = {
    startDeletion: async (_confirmation, key) => {
      calls.push(`start:${key}`);
      return { ...started, deletionControlToken: "token-2" };
    },
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => {
      statusCalls += 1;
      throw new Error("deletion_control_expired");
    },
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
  });
  const state = await service.retry();
  assert.equal(statusCalls, 1);
  assert.equal(state.status, "pending_deletion");
  assert.deepEqual(calls, [`start:${startKey}`, "confirm", "clear-local"]);
  assert.equal(store.value?.phase, "confirmed");
  assert.equal(store.value?.controlToken, "token-2");
});
test("recovery does not restrict an uncommitted confirm-sent request", async () => {
  const store = memoryStore();
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "confirm_sent",
    requestId: "request-1",
    controlToken: "token-1",
  };
  const restrictions: string[] = [];
  const restores: string[] = [];
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => pending,
    getDeletion: async () => awaiting,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal([]),
    restrictOrdinaryAccess: () => { restrictions.push("restrict"); },
    restoreOrdinaryAccess: () => { restores.push("restore"); },
  });
  const state = await service.recover();
  assert.equal(state.status, "awaiting_control_ack");
  assert.deepEqual(restrictions, []);
  assert.deepEqual(restores, ["restore"]);
  assert.equal(store.value?.phase, "awaiting_saved");
});
test("awaiting-saved recovery never auto-confirms a saved start", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "awaiting_saved",
    requestId: "request-1",
    controlToken: "token-1",
  };
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => awaiting,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
  });
  const state = await service.recover();
  assert.equal(state.status, "awaiting_control_ack");
  assert.deepEqual(calls, []);
  assert.equal(store.value?.phase, "awaiting_saved");
});
test("explicit retry confirms an awaiting-saved token", async () => {
  const store = memoryStore();
  const calls: string[] = [];
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "awaiting_saved",
    requestId: "request-1",
    controlToken: "token-1",
  };
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => awaiting,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
  });
  const state = await service.retry();
  assert.equal(state.status, "pending_deletion");
  assert.deepEqual(calls, ["confirm", "clear-local"]);
  assert.equal(store.value?.phase, "confirmed");
});
test("lost explicit retry confirm remains restricted across restart", async () => {
  const store = memoryStore();
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "awaiting_saved",
    requestId: "request-1",
    controlToken: "token-1",
  };
  let confirms = 0;
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => {
      confirms += 1;
      throw new TypeError("response lost");
    },
    getDeletion: async () => awaiting,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal([]),
  });
  await assert.rejects(service.retry(), /response lost/u);
  assert.equal(confirms, 1);
  assert.equal(store.value?.phase, "confirm_sent");
});

test("status proving confirm committed persists the confirmed phase before wiping", async () => {
  const store = memoryStore();
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "awaiting_saved",
    requestId: "request-1",
    controlToken: "token-1",
  };
  const calls: string[] = [];
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => { calls.push("confirm"); return pending; },
    getDeletion: async () => pending,
    retryDeletion: async () => pending,
    ackDeletion: async () => ({ requestId: "request-1", status: "acknowledged" }),
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => ({ id: "a", email: "a@example.com" }),
    clearLocal: clearLocal(calls),
  });
  const state = await service.recover();
  assert.equal(state.status, "pending_deletion");
  assert.deepEqual(calls, ["clear-local"]);
  assert.equal(store.value?.phase, "confirmed");
});

test("confirmed deletion can acknowledge after the session is cleared", async () => {
  const store = memoryStore();
  store.value = {
    ...store.newRecord("d".repeat(64), "a@example.com"),
    phase: "confirmed",
    requestId: "request-1",
    controlToken: "token-1",
    localWipeComplete: true,
  };
  let acknowledgedToken: string | null | undefined;
  const api: PrivacyDeletionApi = {
    startDeletion: async () => started,
    confirmDeletion: async () => pending,
    getDeletion: async () => completed,
    retryDeletion: async () => completed,
    ackDeletion: async (_requestId, token) => {
      acknowledgedToken = token;
      return { requestId: "request-1", status: "acknowledged" };
    },
  };
  const service = new PrivacyDeletionService({
    api,
    store,
    currentUser: () => { throw new Error("logged out"); },
    clearLocal: async () => { throw new Error("local wipe must not repeat"); },
  });
  const state = await service.recover();
  assert.equal(state.status, "completed");
  assert.equal(acknowledgedToken, "token-1");
  assert.equal(store.value, undefined);
});
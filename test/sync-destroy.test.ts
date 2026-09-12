import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import { assertOwnedSyncDirectory } from "../src/desktop/main/sync/sync-directory.js";
import { destroyLocalSyncState } from "../src/desktop/main/sync/sync-destroy.js";
import { SyncRuntimeCore } from "../src/desktop/main/sync/sync-runtime-core.js";

test("sync destruction validates account containment and protects the root", () => {
  const root = join("coolto", "sync");
  const account = join(root, "account-a");
  assert.doesNotThrow(() => assertOwnedSyncDirectory(root, account));
  assert.throws(() => assertOwnedSyncDirectory(root, root), /根目录/u);
  assert.throws(() => assertOwnedSyncDirectory(root, join("coolto", "other")), /根目录之外/u);
  assert.throws(() => assertOwnedSyncDirectory(root, join(root, "account-a", "..", "..", "other")), /根目录之外/u);
});

test("sync destruction stops worker before close, clears reference, then removes without cloud calls", async () => {
  const events: string[] = [];
  const cloudRequests: string[] = [];
  await destroyLocalSyncState({
    stopWorker: async () => { events.push("worker-stopped"); },
    closeStore: () => { events.push("db-closed"); },
    clearStoreReference: () => { events.push("runtime-reference-cleared"); },
    removeDirectory: async () => { events.push("directory-removed"); },
  });
  assert.deepEqual(events, [
    "worker-stopped",
    "db-closed",
    "runtime-reference-cleared",
    "directory-removed",
  ]);
  assert.deepEqual(cloudRequests, []);
});

test("a failed directory removal is retryable after runtime cleanup", async () => {
  let attempts = 0;
  const events: string[] = [];
  const target = {
    stopWorker: async () => { events.push("stop"); },
    closeStore: () => { events.push("close"); },
    clearStoreReference: () => { events.push("clear"); },
    removeDirectory: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("directory locked");
      events.push("remove");
    },
  };
  await assert.rejects(destroyLocalSyncState(target), /directory locked/u);
  await destroyLocalSyncState(target);
  assert.equal(attempts, 2);
  assert.deepEqual(events, ["stop", "close", "clear", "stop", "close", "clear", "remove"]);
});
test("SyncRuntime core retries a concrete failed account-directory removal", async () => {
  let attempts = 0;
  const store = {
    close: () => undefined,
    recordFailure: () => undefined,
    removeLocalDirectory: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("directory locked");
    },
  };
  const worker = {
    run: async () => undefined,
    stop: async () => undefined,
  };
  const runtime = new SyncRuntimeCore({
    openStore: async () => store,
    createWorker: () => worker,
  });
  await runtime.start("http://test", "user-a", "device-a", {} as never, false);
  await assert.rejects(runtime.destroyLocal(), /directory locked/u);
  await runtime.destroyLocal();
  assert.equal(attempts, 2);
  assert.equal(runtime.isStarted, false);
});

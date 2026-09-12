import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createLocalClearOperations,
  type ClearLocalIpcInput,
} from "../src/desktop/main/clear-local-data.js";
import { executeLocalClear } from "../src/desktop/main/privacy/local-clear-service.js";

function operations(overrides: Partial<Parameters<typeof executeLocalClear>[0]> = {}) {
  const calls: string[] = [];
  const cloudRequests: string[] = [];
  return {
    calls,
    cloudRequests,
    operations: {
      agentRunning: false,
      quiesce: async () => undefined,
      clearSync: async () => { calls.push("sync"); },
      clearBusiness: async () => { calls.push("business"); },
      clearBrowser: async () => { calls.push("browser"); },
      clearRendererStorage: async () => { calls.push("renderer"); },
      clearDeviceIdentity: async () => { calls.push("device"); },
      clearSession: async () => { calls.push("session"); },
      ...overrides,
    },
  };
}

test("local clear stops at an active agent without cloud calls", async () => {
  const fixture = operations({ agentRunning: true });
  const result = await executeLocalClear(fixture.operations);
  assert.equal(result.status, "blocked");
  assert.deepEqual(fixture.calls, []);
  assert.deepEqual(fixture.cloudRequests, []);
});

test("local clear is ordered, preserves cloud, and reports retryable scope failures", async () => {
  let failOnce = true;
  const fixture = operations({
    clearBrowser: async () => {
      fixture.calls.push("browser");
      if (failOnce) {
        failOnce = false;
        throw new Error("locked");
      }
    },
  });
  const first = await executeLocalClear(fixture.operations);
  assert.equal(first.status, "partial_failure");
  assert.equal(first.cloudAssets, "preserved");
  assert.deepEqual(first.failed, [{ scope: "browser", code: "local_clear_failed" }]);
  assert.deepEqual(fixture.calls, ["sync", "business", "browser", "renderer", "device"]);

  const second = await executeLocalClear(fixture.operations);
  assert.equal(second.status, "cleared");
  assert.deepEqual(second.failed, []);
  assert.equal(fixture.cloudRequests.length, 0);
});
test("deletion cleanup forwards the recovered account email to device identity removal", async () => {
  const fixture = operations();
  let clearedEmail: string | undefined;
  fixture.operations.accountEmail = "a@example.com";
  fixture.operations.clearDeviceIdentity = async (accountEmail) => {
    clearedEmail = accountEmail;
  };
  const result = await executeLocalClear(fixture.operations);
  assert.equal(result.status, "cleared");
  assert.equal(clearedEmail, "a@example.com");
});
test("local clear quiesces schedulers before deleting scopes", async () => {
  const fixture = operations({
    quiesce: async () => { fixture.calls.push("quiesce"); },
  });
  await executeLocalClear(fixture.operations);
  assert.equal(fixture.calls[0], "quiesce");
});
test("privacy host wires owner-scoped cleanup without invoking it during setup", async () => {
  const source = await readFile(new URL(
    "../src/desktop/main/privacy/privacy-host.ts",
    import.meta.url,
  ), "utf8");
  assert.match(source, /import \{ clearAccountLocalDirectories \} from "\.\/local-account-cleanup\.js";/u);
  assert.match(source, /clearAccountDirectories: \(ownerId\) => clearAccountLocalDirectories/u);
  const cleanup = await readFile(new URL(
    "../src/desktop/main/privacy/local-account-cleanup.ts",
    import.meta.url,
  ), "utf8");
  assert.match(cleanup, /"calendar-links"/u);
});
test("offline local clear still purges the current owner without UserServices", async () => {
  const calls: string[] = [];
  const input: ClearLocalIpcInput = {
    services: () => undefined,
    quiesce: async () => undefined,
    clearSync: async () => undefined,
    clearBrowser: async () => undefined,
    clearRendererStorage: async () => undefined,
    clearSession: async () => undefined,
    clearDeviceIdentity: async () => undefined,
    clearAccountDirectories: async (ownerId) => { calls.push(`dirs:${ownerId}`); },
    clearPrivacyState: async (ownerId) => { calls.push(`privacy:${ownerId}`); },
  };
  const local = createLocalClearOperations(input, "owner-a", "a@example.com");
  await local.clearBusiness();
  assert.deepEqual(calls, ["dirs:owner-a", "privacy:owner-a"]);
});

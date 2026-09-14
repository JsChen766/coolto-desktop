import assert from "node:assert/strict";
import test from "node:test";

import { createCliProfileProposalExecutor } from "../src/cli/cli-profile-proposals.js";
import { pushProfileUpdate } from "../src/cli/cli-profile-writer.js";

function createClient(overrides: {
  currentUser?: () => Promise<{ id: string; email: string; deviceId?: string }>;
  profile?: () => Promise<unknown>;
  bootstrap?: () => Promise<{ changes: Array<Record<string, unknown>> }>;
  push?: (
    deviceId: string,
    operations: unknown[],
    batchId: string,
  ) => Promise<{ results: Array<{ status: string; errorCode?: string | null }> }>;
}) {
  return {
    getCurrentUser: overrides.currentUser ?? (async () => ({ id: "user-1", email: "a@b.c" })),
    getUserProfile: overrides.profile ?? (async () => ({ fullName: null, phone: null })),
    sync: {
      bootstrap: overrides.bootstrap ?? (async () => ({ changes: [] })),
      push: overrides.push ?? (async () => ({ results: [{ status: "applied" }] })),
    },
  } as never;
}

test("pushProfileUpdate pushes a user_profile update through the sync protocol", async () => {
  let pushed: unknown;
  const client = createClient({
    bootstrap: async () => ({
      changes: [{
        entityType: "user_profile",
        entityId: "user-1",
        entityVersion: 3,
        operation: "upsert",
        changedAt: "2026-08-01T00:00:00Z",
        payload: {},
      }],
    }),
    push: async (deviceId: string, operations: unknown[], batchId: string) => {
      pushed = { deviceId, operations, batchId };
      return { results: [{ status: "applied" }] };
    },
  });
  await pushProfileUpdate(
    client,
    { fullName: "陈剑升", phone: "+86 138", contactEmail: "resume@example.com" } as never,
    "session-device-1",
  );
  const { deviceId, operations } = pushed as { deviceId: string; operations: Array<Record<string, unknown>> };
  assert.equal(deviceId, "session-device-1");
  assert.equal(operations.length, 1);
  assert.equal(operations[0]!.entityType, "user_profile");
  assert.equal(operations[0]!.entityId, "user-1");
  assert.equal(operations[0]!.action, "update");
  assert.equal(operations[0]!.expectedVersion, 3);
  assert.equal((operations[0]!.payload as Record<string, unknown>).fullName, "陈剑升");
  assert.equal((operations[0]!.payload as Record<string, unknown>).contactEmail, "resume@example.com");
});

test("pushProfileUpdate throws on conflict and sync errors", async () => {
  const conflictClient = createClient({
    push: async () => ({ results: [{ status: "conflict" }] }),
  });
  await assert.rejects(
    pushProfileUpdate(conflictClient, { fullName: "x" } as never),
    /版本冲突/,
  );
  const failedClient = createClient({
    push: async () => ({ results: [{ status: "validation_failed", errorCode: "bad_field" }] }),
  });
  await assert.rejects(
    pushProfileUpdate(failedClient, { fullName: "x" } as never),
    /validation_failed（bad_field）/,
  );
});

test("executor validates expected fields and pushes on execute", async () => {
  const serverProfile = {
    fullName: "旧名",
    phone: null,
    contactEmail: null,
    location: null,
    linkedinUrl: null,
    githubUrl: null,
    personalWebsite: null,
  };
  let pushedProfile: unknown;
  const client = createClient({
    profile: async () => serverProfile,
    push: async (_d: string, operations: unknown[]) => {
      pushedProfile = (operations[0] as { payload: Record<string, unknown> }).payload;
      return { results: [{ status: "applied" }] };
    },
  });
  const executor = createCliProfileProposalExecutor(client, "session-device-1");

  await assert.rejects(
    executor.prepareImport(
      { fullName: "陈剑升" },
      [{ field: "fullName", currentValue: "另一个值", proposedValue: "陈剑升", selectedByDefault: true, confidence: "high" }],
    ),
    /个人资料已变化/,
  );

  const proposal = await executor.prepareImport(
    { fullName: "陈剑升", phone: "+86 138 0024 6800" },
    [{ field: "fullName", currentValue: "旧名", proposedValue: "陈剑升", selectedByDefault: true, confidence: "high" }],
  );
  await executor.execute(proposal.id);
  assert.equal((pushedProfile as Record<string, unknown>).fullName, "陈剑升");
  assert.equal((pushedProfile as Record<string, unknown>).phone, "+86 138 0024 6800");

  await assert.rejects(executor.execute(proposal.id), /不存在或已失效/);
});

test("executor uses the device identity of the authenticated session", async () => {
  const serverProfile = {
    fullName: null, phone: null, contactEmail: null, location: null,
    linkedinUrl: null, githubUrl: null, personalWebsite: null,
  };
  let pushedDeviceId: string | undefined;
  const client = createClient({
    profile: async () => serverProfile,
    push: async (deviceId: string) => {
      pushedDeviceId = deviceId;
      return { results: [{ status: "applied" }] };
    },
  });
  const executor = createCliProfileProposalExecutor(client, "session-device-1");
  const proposal = await executor.prepareImport(
    { fullName: "Alice" },
    [{ field: "fullName", currentValue: null, proposedValue: "Alice", selectedByDefault: true, confidence: "high" }],
  );

  await executor.execute(proposal.id);
  assert.equal(pushedDeviceId, "session-device-1");
});

test("executor falls back to the persisted CLI device identity without a session device", async () => {
  const client = createClient({
    profile: async () => ({
      fullName: null, phone: null, contactEmail: null, location: null,
      linkedinUrl: null, githubUrl: null, personalWebsite: null,
    }),
    push: async (deviceId: string) => {
      assert.ok(deviceId.length > 0);
      return { results: [{ status: "applied" }] };
    },
  });
  const executor = createCliProfileProposalExecutor(client);
  const proposal = await executor.prepareImport(
    { fullName: "Alice" },
    [{ field: "fullName", currentValue: null, proposedValue: "Alice", selectedByDefault: true, confidence: "high" }],
  );

  await executor.execute(proposal.id);
});

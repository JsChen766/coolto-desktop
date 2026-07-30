import assert from "node:assert/strict";
import test from "node:test";

import type { SyncEntityType } from "../src/sync/types.js";
import type { LocalSyncStore } from "../src/desktop/main/sync/local-sync-store.js";
import type { EnqueueMutation, LocalEntity, SyncIssue } from "../src/desktop/main/sync/local-sync-types.js";
import { TrackerRecoveryService } from "../src/desktop/main/tracker/tracker-recovery-service.js";

test("Tracker 冲突重新提交使用服务端版本和字段白名单", async () => {
  const store = fakeStore(noteIssue());
  let triggers = 0;
  const service = new TrackerRecoveryService(
    store.value, () => { triggers += 1; }, async () => undefined, async () => undefined,
  );
  const proposal = await service.prepare("application_note", "note", "reapply");
  await service.execute(proposal.id);
  assert.equal(store.replacements.length, 1);
  assert.equal(store.replacements[0]?.expectedVersion, 2);
  assert.deepEqual(store.replacements[0]?.payload, {
    applicationId: "application", interviewRoundId: null,
    noteType: "follow_up", content: "local content",
  });
  assert.equal("unexpected" in store.replacements[0]!.payload, false);
  assert.equal(triggers, 1);
});

test("Tracker 恢复 Proposal 漂移时拒绝且保留重试资格", async () => {
  const issue = noteIssue();
  const store = fakeStore(issue);
  const service = new TrackerRecoveryService(
    store.value, () => undefined, async () => undefined, async () => undefined,
  );
  const proposal = await service.prepare("application_note", "note", "reapply");
  issue.serverVersion = 3;
  await assert.rejects(() => service.execute(proposal.id), /已经变化/);
  issue.serverVersion = 2;
  await service.execute(proposal.id);
  assert.equal(store.replacements.length, 1);
});

test("没有服务端 baseline 的 create 失败不能盲目重新提交", async () => {
  const issue = noteIssue();
  issue.action = "create";
  issue.serverOperation = null;
  issue.serverPayload = null;
  const store = fakeStore(issue);
  const service = new TrackerRecoveryService(
    store.value, () => undefined, async () => undefined, async () => undefined,
  );
  const listed = await service.list();
  assert.equal(listed[0]?.canReapply, false);
  await assert.rejects(
    () => service.prepare("application_note", "note", "reapply"), /不能安全/,
  );
});

test("立即重试先重置退避并等待一次完整同步", async () => {
  const store = fakeStore(noteIssue());
  const order: string[] = [];
  store.retry = () => { order.push("retry"); };
  const service = new TrackerRecoveryService(
    store.value, () => undefined, async () => undefined,
    async () => { order.push("sync"); },
  );
  await service.retryPending();
  assert.deepEqual(order, ["retry", "sync"]);
});

function noteIssue(): SyncIssue {
  return {
    entityType: "application_note", entityId: "note", status: "conflict",
    action: "update", serverVersion: 2, serverOperation: "upsert",
    errorCode: "entity_version_conflict",
    localPayload: {
      id: "note", applicationId: "application", interviewRoundId: null,
      noteType: "follow_up", content: "local content", unexpected: "blocked",
    },
    serverPayload: { id: "note", applicationId: "application", content: "server" },
  };
}

function fakeStore(issue: SyncIssue) {
  const replacements: EnqueueMutation[] = [];
  let retry: () => void = () => undefined;
  const entity: LocalEntity = {
    entityType: issue.entityType, entityId: issue.entityId, entityVersion: 2,
    localVersion: 1, syncStatus: issue.status, operation: "upsert",
    changedAt: "2026-07-29T00:00:00.000Z", payload: issue.localPayload,
  };
  const state = {
    listEntities: (type: SyncEntityType) => type === issue.entityType ? [entity] : [],
    getSyncIssue: (type: SyncEntityType, id: string) =>
      type === issue.entityType && id === issue.entityId ? issue : undefined,
    replaceBlocked: (mutation: EnqueueMutation) => { replacements.push(mutation); },
    acceptServer: () => undefined,
    retryPendingNow: () => retry(),
  };
  return { value: state as unknown as LocalSyncStore, replacements,
    set retry(value: () => void) { retry = value; } };
}

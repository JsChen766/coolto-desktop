import assert from "node:assert/strict";
import test from "node:test";

import { ApplicationSyncStore } from "../src/desktop/main/application-library/application-sync-store.js";
import type {
  EnqueueMutation,
  LocalEntity,
} from "../src/desktop/main/sync/local-sync-types.js";
import type { SyncEntityType } from "../src/sync/types.js";

const now = "2026-07-28T08:00:00.000Z";

test("ApplicationSyncStore creates from local asset snapshots through Outbox", async () => {
  const storage = new FakeStorage();
  storage.seed("job_description", "jd-1", { title: "JD snapshot" });
  storage.seed("resume", "resume-1", { title: "Resume snapshot" });
  let triggers = 0;
  const store = new ApplicationSyncStore(storage, () => { triggers += 1; }, async () => {});

  const created = await store.createApplication({
    jdId: "jd-1",
    resumeId: "resume-1",
    companyName: "Coolto",
    roleName: "Engineer",
    deliveryMethod: "manual",
    appliedAt: now,
    idempotencyKey: "create-1",
  });

  assert.equal(created.jdTitleSnapshot, "JD snapshot");
  assert.equal(created.resumeTitleSnapshot, "Resume snapshot");
  assert.equal(created.status, "applied");
  assert.equal(created.syncStatus, "pending");
  assert.equal(storage.operations[0]?.action, "create");
  assert.equal(storage.operations[0]?.expectedVersion, null);
  assert.equal(triggers, 1);
});

test("ApplicationSyncStore updates metadata, transitions, then tombstones", async () => {
  const storage = new FakeStorage();
  storage.seed("application", "app-1", applicationPayload(), 3);
  const store = new ApplicationSyncStore(storage, () => {}, async () => {});

  const updated = await store.updateApplication("app-1", {
    jdId: null,
    resumeId: null,
    companyName: "Coolto 2",
    roleName: "Senior Engineer",
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: now,
    pendingConfirmation: false,
    companyBusiness: null,
    roleSummary: null,
    companyCulture: null,
    rejectionReason: null,
  });
  assert.equal(updated.companyName, "Coolto 2");
  assert.equal(storage.operations.at(-1)?.action, "update");
  assert.equal(storage.operations.at(-1)?.expectedVersion, 3);

  const transitioned = await store.transitionApplication("app-1", {
    toStatus: "screening",
    reason: "HR contacted",
  });
  assert.equal(transitioned.status, "screening");
  assert.equal(storage.operations.at(-1)?.action, "transition");
  assert.deepEqual(storage.operations.at(-1)?.payload, {
    toStatus: "screening",
    occurredAt: null,
    reason: "HR contacted",
  });

  await assert.rejects(
    store.transitionApplication("app-1", { toStatus: "offer" }),
    /非法投递状态迁移/,
  );
  const deleted = await store.deleteApplication("app-1");
  assert.equal(deleted.id, "app-1");
  assert.equal(storage.operations.at(-1)?.action, "delete");
  assert.deepEqual(storage.operations.at(-1)?.payload, {});
});

class FakeStorage {
  readonly operations: EnqueueMutation[] = [];
  readonly #entities = new Map<string, LocalEntity>();

  public seed(
    entityType: SyncEntityType,
    entityId: string,
    payload: Record<string, unknown>,
    entityVersion = 1,
  ): void {
    this.#entities.set(key(entityType, entityId), {
      entityType,
      entityId,
      entityVersion,
      localVersion: 1,
      syncStatus: "clean",
      operation: "upsert",
      changedAt: now,
      payload,
    });
  }

  public getEntity(entityType: SyncEntityType, entityId: string): LocalEntity | undefined {
    return this.#entities.get(key(entityType, entityId));
  }

  public listEntities(entityType: SyncEntityType): LocalEntity[] {
    return [...this.#entities.values()].filter((entity) => entity.entityType === entityType);
  }

  public resolveCreateIdentity(): { entityId: string; operationId: string } {
    return { entityId: "app-created", operationId: "operation-created" };
  }

  public enqueue(mutation: EnqueueMutation): string {
    this.operations.push(structuredClone(mutation));
    const previous = this.getEntity(mutation.entityType, mutation.entityId);
    this.#entities.set(key(mutation.entityType, mutation.entityId), {
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      entityVersion: mutation.expectedVersion ?? 0,
      localVersion: (previous?.localVersion ?? 0) + 1,
      syncStatus: "pending",
      operation: mutation.action === "delete" ? "delete" : "upsert",
      changedAt: mutation.createdAt ?? now,
      payload: structuredClone(mutation.localPayload ?? mutation.payload),
    });
    return mutation.operationId;
  }
}

function key(entityType: SyncEntityType, entityId: string): string {
  return `${entityType}\0${entityId}`;
}

function applicationPayload(): Record<string, unknown> {
  return {
    id: "app-1",
    jdId: null,
    resumeId: null,
    companyName: "Coolto",
    roleName: "Engineer",
    jdTitleSnapshot: null,
    resumeTitleSnapshot: null,
    deliveryMethod: "manual",
    targetUrl: null,
    appliedAt: now,
    status: "applied",
    pendingConfirmation: false,
    source: "manual",
    dedupeKey: null,
    companyBusiness: null,
    roleSummary: null,
    companyCulture: null,
    rejectionReason: null,
    entityVersion: 3,
    createdAt: now,
    updatedAt: now,
  };
}

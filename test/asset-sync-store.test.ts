import assert from "node:assert/strict";
import test from "node:test";

import { ExperienceSyncStore } from "../src/desktop/main/experience-library/experience-sync-store.js";
import { JdSyncStore } from "../src/desktop/main/jd-library/jd-sync-store.js";
import type { LocalSyncStore } from "../src/desktop/main/sync/local-sync-store.js";
import type {
  EnqueueMutation,
  LocalEntity,
} from "../src/desktop/main/sync/local-sync-types.js";
import type { SyncEntityType } from "../src/sync/types.js";
import { createUuidV7 } from "../src/sync/uuid-v7.js";

class FakeLocalSyncStore {
  readonly mutations: EnqueueMutation[] = [];
  readonly #entities = new Map<string, LocalEntity>();
  readonly #identities = new Map<string, {
    entityId: string;
    operationId: string;
    request: string;
  }>();

  resolveCreateIdentity(entityType: SyncEntityType, key: string, request: unknown) {
    const lookup = `${entityType}\0${key}`;
    const serialized = JSON.stringify(request);
    const existing = this.#identities.get(lookup);
    if (existing) {
      if (existing.request !== serialized) throw new Error("key reused");
      return existing;
    }
    const created = {
      entityId: createUuidV7(),
      operationId: createUuidV7(),
      request: serialized,
    };
    this.#identities.set(lookup, created);
    return created;
  }

  enqueue(mutation: EnqueueMutation): string {
    this.mutations.push(mutation);
    this.#entities.set(`${mutation.entityType}\0${mutation.entityId}`, {
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      entityVersion: 0,
      localVersion: 1,
      syncStatus: "pending",
      operation: "upsert",
      changedAt: new Date().toISOString(),
      payload: mutation.localPayload ?? mutation.payload,
    });
    return mutation.operationId;
  }

  getEntity(entityType: SyncEntityType, entityId: string): LocalEntity | undefined {
    return this.#entities.get(`${entityType}\0${entityId}`);
  }

  listEntities(entityType: SyncEntityType): LocalEntity[] {
    return [...this.#entities.values()].filter((item) => item.entityType === entityType);
  }
}

test("ExperienceSyncStore reuses the local entity for one idempotency key", async () => {
  const local = new FakeLocalSyncStore();
  const store = new ExperienceSyncStore(
    local as unknown as LocalSyncStore,
    () => undefined,
    async () => undefined,
  );
  const input = {
    category: "work" as const,
    title: "Engineer",
    content: "Built sync",
    startDate: "2022-01",
    endDate: "present",
    idempotencyKey: "import-1:candidate-1",
  };

  const first = await store.createExperience(input);
  const replay = await store.createExperience(input);

  assert.equal(replay.id, first.id);
  assert.equal(first.syncStatus, "pending");
  assert.equal(local.mutations.length, 1);
});

test("JdSyncStore reuses requirement ids for one idempotency key", async () => {
  const local = new FakeLocalSyncStore();
  const store = new JdSyncStore(
    local as unknown as LocalSyncStore,
    () => undefined,
    async () => undefined,
  );
  const input = {
    title: "Backend Engineer",
    rawText: "Build reliable services",
    idempotencyKey: "jd-key",
    requirements: [
      { text: "Go", category: "skill", importance: "high" as const, keywords: [] },
    ],
  };

  const first = await store.createJd(input);
  const replay = await store.createJd(input);

  assert.equal(replay.id, first.id);
  assert.equal(replay.requirements[0]!.id, first.requirements[0]!.id);
  assert.equal(local.mutations.length, 1);
});

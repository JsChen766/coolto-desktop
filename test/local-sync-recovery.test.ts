import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { LocalEntityStore } from "../src/desktop/main/sync/local-entity-store.js";
import { LocalOutboxStore } from "../src/desktop/main/sync/local-outbox-store.js";
import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";
import { SyncPayloadCodec } from "../src/desktop/main/sync/payload-codec.js";
import { RemotePageWriter } from "../src/desktop/main/sync/remote-page-writer.js";
import { SyncRecoveryStore } from "../src/desktop/main/sync/sync-recovery-store.js";

function stores() {
  const database = new DatabaseSync(":memory:");
  initializeLocalSyncSchema(database);
  const codec = new SyncPayloadCodec(Buffer.alloc(32, 7));
  return {
    database,
    entities: new LocalEntityStore(database, codec),
    outbox: new LocalOutboxStore(database, codec),
    remote: new RemotePageWriter(database, codec),
    recovery: new SyncRecoveryStore(database, codec),
  };
}

function projection(id: string, title: string) {
  return {
    id,
    category: "work",
    title,
    organization: null,
    role: null,
    location: null,
    startDate: null,
    endDate: null,
    tags: [],
    status: "active",
    currentRevisionId: "rev-1",
    currentRevision: {
      id: "rev-1",
      experienceId: id,
      content: title,
      source: "manual",
      revisionHash: "hash",
      revisionNumber: 1,
      createdAt: "2026-07-29T00:00:00Z",
    },
    createdAt: "2026-07-29T00:00:00Z",
    updatedAt: "2026-07-29T00:00:00Z",
  };
}

test("outbox replays offline create update delete in entity order", () => {
  const state = stores();
  const id = "exp-1";
  state.outbox.enqueue({
    operationId: "op-create",
    entityType: "experience",
    entityId: id,
    action: "create",
    expectedVersion: null,
    payload: { create: true },
    localPayload: projection(id, "created"),
  });
  state.outbox.enqueue({
    operationId: "op-update",
    entityType: "experience",
    entityId: id,
    action: "update",
    expectedVersion: 0,
    payload: { update: true },
    localPayload: projection(id, "updated"),
  });
  state.outbox.enqueue({
    operationId: "op-delete",
    entityType: "experience",
    entityId: id,
    action: "delete",
    expectedVersion: 0,
    payload: {},
    localPayload: projection(id, "updated"),
  });

  assert.equal(state.outbox.listReady("9999-01-01T00:00:00Z", 10)[0]?.operationId, "op-create");
  state.outbox.applyResult({
    operationId: "op-create", status: "applied", entityId: id,
    appliedVersion: 1, serverEntity: projection(id, "created"),
  }, "");
  assert.equal(state.outbox.listReady("9999-01-01T00:00:00Z", 10)[0]?.expectedVersion, 1);
  state.outbox.applyResult({
    operationId: "op-update", status: "applied", entityId: id,
    appliedVersion: 2, serverEntity: projection(id, "updated"),
  }, "");
  const deletion = state.outbox.listReady("9999-01-01T00:00:00Z", 10)[0];
  assert.equal(deletion?.operationId, "op-delete");
  assert.equal(deletion?.expectedVersion, 2);
  state.outbox.applyResult({
    operationId: "op-delete", status: "applied", entityId: id,
    appliedVersion: 3, serverEntity: null,
  }, "");

  const entity = state.entities.get("experience", id);
  assert.equal(entity?.syncStatus, "clean");
  assert.equal(entity?.operation, "delete");
  assert.equal(entity?.lastServerOperation, "delete");
  assert.deepEqual(entity?.lastServerPayload, {});
  state.database.close();
});

test("validation failure is failed and accepting server restores baseline", () => {
  const state = stores();
  const id = "exp-2";
  state.remote.apply({
    changes: [{
      entityType: "experience", entityId: id, entityVersion: 1,
      operation: "upsert", changedAt: "2026-07-29T00:00:00Z",
      payload: projection(id, "server"),
    }],
    nextCursor: "cursor-1", hasMore: false, serverTime: "2026-07-29T00:00:00Z",
  }, "pull");
  state.outbox.enqueue({
    operationId: "op-invalid", entityType: "experience", entityId: id,
    action: "update", expectedVersion: 1, payload: { invalid: true },
    localPayload: projection(id, "local"),
  });
  state.outbox.applyResult({
    operationId: "op-invalid", status: "validation_failed", entityId: id,
    appliedVersion: null, errorCode: "invalid_experience",
  }, "");

  const issue = state.recovery.get("experience", id);
  assert.equal(issue?.status, "failed");
  assert.equal(issue?.errorCode, "invalid_experience");
  assert.equal(state.entities.get("experience", id)?.syncStatus, "failed");
  state.recovery.acceptServer("experience", id);
  const restored = state.entities.get("experience", id);
  assert.equal(restored?.syncStatus, "clean");
  assert.equal(restored?.payload.title, "server");
  state.database.close();
});

test("remote tombstone converts blocked update to conflict without overwriting local", () => {
  const state = stores();
  const id = "exp-3";
  state.remote.apply({
    changes: [{
      entityType: "experience", entityId: id, entityVersion: 1,
      operation: "upsert", changedAt: "2026-07-29T00:00:00Z",
      payload: projection(id, "server"),
    }],
    nextCursor: "cursor-1", hasMore: false, serverTime: "2026-07-29T00:00:00Z",
  }, "pull");
  state.outbox.enqueue({
    operationId: "op-local", entityType: "experience", entityId: id,
    action: "update", expectedVersion: 1, payload: { title: "local" },
    localPayload: projection(id, "local"),
  });
  state.remote.apply({
    changes: [{
      entityType: "experience", entityId: id, entityVersion: 2,
      operation: "delete", changedAt: "2026-07-29T01:00:00Z", payload: {},
    }],
    nextCursor: "cursor-2", hasMore: false, serverTime: "2026-07-29T01:00:00Z",
  }, "pull");

  const issue = state.recovery.get("experience", id);
  assert.equal(issue?.status, "conflict");
  assert.equal(issue?.serverOperation, "delete");
  assert.equal(issue?.localPayload.title, "local");
  state.recovery.acceptServer("experience", id);
  assert.equal(state.entities.get("experience", id)?.operation, "delete");
  state.database.close();
});

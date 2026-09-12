import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { createProfileLocalPayloadMerger } from "../src/desktop/main/profile/profile-local-sync-adapter.js";
import {
  toProfileLocalPayload,
  toProfileServerPushPayload,
  toProfileWritePayload,
  toUserProfile,
} from "../src/desktop/main/profile/profile-sync-mapping.js";
import { LocalEntityStore } from "../src/desktop/main/sync/local-entity-store.js";
import { LocalOutboxStore } from "../src/desktop/main/sync/local-outbox-store.js";
import { SyncRecoveryStore } from "../src/desktop/main/sync/sync-recovery-store.js";
import { SyncPayloadCodec } from "../src/desktop/main/sync/payload-codec.js";
import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";
import { RemotePageWriter } from "../src/desktop/main/sync/remote-page-writer.js";

const ownerId = "owner-profile-roundtrip";
const changedAt = "2026-09-08T00:00:00.000Z";

test("Profile opaque target ID survives push ack, pull, restart, and fresh-device separation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-profile-target-id-"));
  const path = join(directory, "local-sync.sqlite");
  const codec = new SyncPayloadCodec(Buffer.alloc(32, 13));
  let database: DatabaseSync | undefined;
  let restarted: DatabaseSync | undefined;
  let fresh: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(path);
    initializeLocalSyncSchema(database);
    const merger = createProfileLocalPayloadMerger(database, ownerId);
    const remote = new RemotePageWriter(database, codec, merger);
    const outbox = new LocalOutboxStore(database, codec, merger);
    const entities = new LocalEntityStore(database, codec);
    remote.apply(page(1, serverPayload()), "bootstrap");
    const first = toUserProfile(entities.get("user_profile", ownerId)!);
    const opaqueId = first.careerTargets![0]!.id;
    assert.match(opaqueId, /^[0-9a-f-]{36}$/u);
    const localPayload = toProfileLocalPayload(first);
    const remotePayload = toProfileServerPushPayload(first);
    assert.equal("careerTargets" in remotePayload, false);
    assert.deepEqual(remotePayload.targetRoles, first.targetRoles);
    outbox.enqueue({
      operationId: "profile-roundtrip-update", entityType: "user_profile", entityId: ownerId,
      action: "update", expectedVersion: 1, payload: remotePayload, localPayload,
    });
    outbox.applyResult({
      operationId: "profile-roundtrip-update", status: "applied", entityId: ownerId,
      appliedVersion: 2, serverEntity: serverPayload({ fullName: "Server Echo" }),
    }, changedAt);
    assert.equal(toUserProfile(entities.get("user_profile", ownerId)!).careerTargets![0]!.id, opaqueId);
    database.close();
    database = undefined;
    restarted = new DatabaseSync(path);
    initializeLocalSyncSchema(restarted);
    const restartedMerger = createProfileLocalPayloadMerger(restarted, ownerId);
    const restartedEntities = new LocalEntityStore(restarted, codec);
    assert.equal(toUserProfile(restartedEntities.get("user_profile", ownerId)!).careerTargets![0]!.id, opaqueId);
    new RemotePageWriter(restarted, codec, restartedMerger).apply(
      page(3, serverPayload({ currentCompany: "New Company" })), "pull",
    );
    assert.equal(toUserProfile(restartedEntities.get("user_profile", ownerId)!).careerTargets![0]!.id, opaqueId);
    const conflictOutbox = new LocalOutboxStore(restarted, codec, restartedMerger);
    const current = toUserProfile(restartedEntities.get("user_profile", ownerId)!);
    conflictOutbox.enqueue({
      operationId: "profile-roundtrip-conflict", entityType: "user_profile", entityId: ownerId,
      action: "update", expectedVersion: 3, payload: toProfileServerPushPayload(current),
      localPayload: toProfileLocalPayload(current),
    });
    conflictOutbox.applyResult({
      operationId: "profile-roundtrip-conflict", status: "conflict", entityId: ownerId,
      appliedVersion: 4, serverEntity: serverPayload({ currentCompany: "Conflict Server" }),
      errorCode: "entity_version_conflict",
    }, changedAt);
    new SyncRecoveryStore(restarted, codec, restartedMerger)
      .acceptServer("user_profile", ownerId);
    assert.equal(toUserProfile(restartedEntities.get("user_profile", ownerId)!).careerTargets![0]!.id, opaqueId);
    restarted.close();
    restarted = undefined;

    fresh = new DatabaseSync(join(directory, "fresh.sqlite"));
    initializeLocalSyncSchema(fresh);
    const freshMerger = createProfileLocalPayloadMerger(fresh, ownerId);
    new RemotePageWriter(fresh, codec, freshMerger).apply(
      page(1, serverPayload()), "bootstrap",
    );
    const freshProfile = toUserProfile(
      new LocalEntityStore(fresh, codec).get("user_profile", ownerId)!,
    );
    assert.notEqual(freshProfile.careerTargets![0]!.id, opaqueId);
    assert.equal(freshProfile.careerTargets![0]!.idKind, "opaque");
    assert.equal(freshProfile.careerTargets![0]!.role, first.careerTargets![0]!.role);
    fresh.close();
    fresh = undefined;
  } finally {
    for (const handle of [database, restarted, fresh]) {
      try { handle?.close(); } catch { /* cleanup only */ }
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("Profile remote page validates canonical/legacy targets transactionally", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-profile-page-"));
  const database = new DatabaseSync(join(directory, "local-sync.sqlite"));
  const codec = new SyncPayloadCodec(Buffer.alloc(32, 17));
  try {
    initializeLocalSyncSchema(database);
    const merger = createProfileLocalPayloadMerger(database, ownerId);
    const remote = new RemotePageWriter(database, codec, merger);
    const entities = new LocalEntityStore(database, codec);
    remote.apply(page(1, serverPayload()), "bootstrap");
    const beforeEntity = entities.get("user_profile", ownerId);
    const beforeState = database.prepare("SELECT mode, cursor FROM sync_state WHERE singleton = 1").get();
    const transient = page(2, serverPayload({ currentCompany: "Transient" }));
    const invalid = page(3, serverPayload({ targetRoles: ["工程师"] }));
    assert.throws(() => remote.apply(
      { ...transient, changes: [transient.changes[0]!, invalid.changes[0]!], nextCursor: "cursor-invalid" },
      "pull",
    ), /不一致/u);
    assert.deepEqual(entities.get("user_profile", ownerId), beforeEntity);
    assert.deepEqual(
      database.prepare("SELECT mode, cursor FROM sync_state WHERE singleton = 1").get(),
      beforeState,
    );
    remote.apply(page(2, serverPayload({ currentCompany: "New Company" })), "pull");
    assert.equal(entities.get("user_profile", ownerId)?.entityVersion, 2);
    assert.equal(entities.get("user_profile", ownerId)?.payload.currentCompany, "New Company");
    const afterState = database.prepare("SELECT mode, cursor FROM sync_state WHERE singleton = 1").get() as {
      mode: string; cursor: string;
    };
    assert.equal(afterState.mode, "pull");
    assert.equal(afterState.cursor, "cursor-2");
  } finally {
    database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function page(entityVersion: number, payload: Record<string, unknown>) {
  return {
    changes: [{
      entityType: "user_profile" as const, entityId: ownerId, entityVersion,
      operation: "upsert" as const, changedAt, payload,
    }],
    nextCursor: `cursor-${entityVersion}`, hasMore: false, serverTime: changedAt,
  };
}

function serverPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fullName: "Local User", contactEmail: null, phone: "+852 1234 5678", location: "Hong Kong",
    linkedinUrl: null, githubUrl: null, personalWebsite: null, currentTitle: "Product Manager",
    currentCompany: "Old Company", yearsOfExperience: 5, careerStage: "career_change",
    careerTargets: [{ role: "Product Manager", industries: ["SaaS"], locations: ["Hong Kong"], isPrimary: true }],
    targetRoles: ["Product Manager"], targetIndustries: ["SaaS"], targetLocations: ["Hong Kong"],
    preferredLanguage: "en-US", resumeStyle: "standard", ...overrides,
  };
}

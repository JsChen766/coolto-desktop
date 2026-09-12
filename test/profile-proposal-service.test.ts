import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { ProfileProposalService } from "../src/desktop/main/profile/profile-proposal-service.js";
import { ProfileSyncStore } from "../src/desktop/main/profile/profile-sync-store.js";
import type { LocalSyncStore } from "../src/desktop/main/sync/local-sync-store.js";
import type { EnqueueMutation, LocalEntity, SyncIssue } from "../src/desktop/main/sync/local-sync-types.js";
import { LocalEntityStore } from "../src/desktop/main/sync/local-entity-store.js";
import { LocalOutboxStore } from "../src/desktop/main/sync/local-outbox-store.js";
import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";
import { SyncPayloadCodec } from "../src/desktop/main/sync/payload-codec.js";

class FakeLocalSyncStore {
  readonly writes: EnqueueMutation[] = [];
  readonly entities = new Map<string, LocalEntity>();
  issue: SyncIssue | undefined;

  public constructor() {
    this.entities.set("user-a", entity("user-a", "Alice", "alice@resume.test"));
    this.entities.set("user-b", entity("user-b", "Bob", "bob@resume.test"));
  }

  getEntity(_type: string, id: string): LocalEntity | undefined { return this.entities.get(id); }
  enqueue(mutation: EnqueueMutation): string { this.writes.push(mutation); this.apply(mutation); return mutation.operationId; }
  replaceBlocked(mutation: EnqueueMutation): void { this.writes.push(mutation); this.apply(mutation); }
  acceptServer(_type: string, id: string): void {
    if (!this.issue?.serverPayload) throw new Error("missing server baseline");
    const current = this.entities.get(id)!;
    this.entities.set(id, { ...current, entityVersion: this.issue.serverVersion,
      syncStatus: "clean", payload: this.issue.serverPayload });
  }
  getSyncIssue(): SyncIssue | undefined { return this.issue; }

  private apply(mutation: EnqueueMutation): void {
    const current = this.entities.get(mutation.entityId)!;
    this.entities.set(mutation.entityId, { ...current, localVersion: current.localVersion + 1,
      syncStatus: "pending", payload: mutation.localPayload ?? mutation.payload });
  }
}

function service(local: FakeLocalSyncStore, ownerId = "user-a") {
  const store = new ProfileSyncStore(ownerId, local as unknown as LocalSyncStore, () => undefined, async () => undefined);
  return { store, proposals: new ProfileProposalService(store, async () => undefined) };
}

test("Profile proposal writes no Outbox entry before approval and keeps resume email separate", async () => {
  const local = new FakeLocalSyncStore();
  const { proposals } = service(local);
  const proposal = await proposals.prepareUpdate({ fullName: "Alice Zhang", contactEmail: "contact@example.test" });
  assert.equal(local.writes.length, 0);
  assert.equal(proposal.current.contactEmail, "alice@resume.test");
  await proposals.execute(proposal.id);
  assert.equal(local.writes.length, 1);
  assert.equal(local.writes[0]?.entityId, "user-a");
  assert.equal("contactEmail" in (local.writes[0]?.payload ?? {}), false);
  assert.equal(local.writes[0]?.localPayload?.contactEmail, "contact@example.test");
  assert.equal((local.entities.get("user-a")?.payload as Record<string, unknown>).contactEmail,
    "contact@example.test");
  assert.equal("email" in (local.entities.get("user-a")?.payload ?? {}), false);
  assert.equal((await service(local).store.getProfileView()).syncStatus, "pending");
});

test("Profile unrelated edits reject unknown legacy defaults before Outbox", async () => {
  const local = new FakeLocalSyncStore();
  const current = local.entities.get("user-a")!;
  local.entities.set("user-a", {
    ...current, payload: { ...current.payload, resumeStyle: "legacy-style" },
  });
  const { proposals } = service(local);
  await assert.rejects(
    () => proposals.prepareUpdate({ currentCompany: "New Company" }),
    /简历默认风格/u,
  );
  assert.equal(local.writes.length, 0);
});

test("Profile import refuses an overwritten snapshot and stale local proposal", async () => {
  const local = new FakeLocalSyncStore();
  const { proposals } = service(local);
  const proposal = await proposals.prepareImport({ fullName: "Alice Parsed" }, [{
    field: "fullName", currentValue: "Alice", proposedValue: "Alice Parsed",
    selectedByDefault: false, confidence: "low",
  }]);
  local.entities.set("user-a", { ...local.entities.get("user-a")!, localVersion: 3 });
  await assert.rejects(proposals.execute(proposal.id), /个人资料已变化/);
  assert.equal(local.writes.length, 0);
});

test("Profile conflict reapply uses the server version and isolates account projections", async () => {
  const local = new FakeLocalSyncStore();
  const { store, proposals } = service(local);
  const other = service(local, "user-b").store;
  assert.equal((await other.getUserProfile()).fullName, "Bob");
  const current = store.currentEntity();
  local.issue = {
    entityType: "user_profile", entityId: "user-a", status: "conflict", action: "update",
    serverVersion: 9, serverOperation: "upsert", errorCode: "version_conflict",
    localPayload: current.payload, serverPayload: { ...current.payload, fullName: "Server Alice" },
  };
  local.entities.set("user-a", { ...current, entityVersion: 9, syncStatus: "conflict" });
  const proposal = await proposals.prepareReapply({ fullName: "Merged Alice" });
  await proposals.execute(proposal.id);
  assert.equal(local.writes[0]?.expectedVersion, 9);
  assert.equal((await other.getUserProfile()).fullName, "Bob");
});

test("Profile accept-server proposal freezes the fresh server before approval", async () => {
  const local = new FakeLocalSyncStore();
  const { proposals, store } = service(local);
  const current = store.currentEntity();
  local.issue = {
    entityType: "user_profile", entityId: "user-a", status: "conflict", action: "update",
    serverVersion: 9, serverOperation: "upsert", errorCode: "version_conflict",
    localPayload: current.payload, serverPayload: { ...current.payload, fullName: "Server Alice" },
  };
  local.entities.set("user-a", { ...current, entityVersion: 9, syncStatus: "conflict" });
  const proposal = await proposals.prepareAcceptServer();
  assert.equal(proposal.current.fullName, "Alice");
  assert.equal(proposal.next?.fullName, "Server Alice");
  assert.equal(local.writes.length, 0);
  await proposals.execute(proposal.id);
  assert.equal((await store.getUserProfile()).fullName, "Server Alice");
});

test("Profile view keeps legacy local projections readable before a contact email exists", async () => {
  const local = new FakeLocalSyncStore();
  const { store } = service(local);
  const current = local.entities.get("user-a")!;
  const payload = { ...current.payload };
  delete payload.contactEmail;
  local.entities.set("user-a", { ...current, payload });
  assert.equal((await store.getProfileView()).contactEmail, null);
});

test("offline Profile update survives restart and remains ready for Outbox replay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-profile-sync-"));
  const path = join(directory, "local-sync.sqlite");
  const key = Buffer.alloc(32, 9);
  try {
    const first = new DatabaseSync(path);
    initializeLocalSyncSchema(first);
    new LocalOutboxStore(first, new SyncPayloadCodec(key)).enqueue({
      operationId: "op-profile", entityType: "user_profile", entityId: "user-a",
      action: "update", expectedVersion: 2, payload: entity("user-a", "Offline Alice", "offline@example.test").payload,
      localPayload: entity("user-a", "Offline Alice", "offline@example.test").payload,
    });
    first.close();
    const restarted = new DatabaseSync(path);
    const codec = new SyncPayloadCodec(key);
    const ready = new LocalOutboxStore(restarted, codec).listReady("9999-01-01T00:00:00Z", 1);
    assert.equal(ready[0]?.entityType, "user_profile");
    assert.equal(ready[0]?.payload.contactEmail, "offline@example.test");
    assert.equal(new LocalEntityStore(restarted, codec).get("user_profile", "user-a")?.syncStatus, "pending");
    restarted.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function entity(id: string, fullName: string, contactEmail: string): LocalEntity {
  return {
    entityType: "user_profile", entityId: id, entityVersion: 2, localVersion: 2,
    syncStatus: "clean", operation: "upsert", changedAt: "2026-08-03T00:00:00Z",
    payload: {
      fullName, contactEmail, phone: "+852 1234 5678", location: null,
      linkedinUrl: null, githubUrl: null, personalWebsite: null, currentTitle: null,
      currentCompany: null, yearsOfExperience: null, careerStage: null,
      targetRoles: [], targetIndustries: [], targetLocations: [], preferredLanguage: "zh-CN",
      resumeStyle: null,
    },
  };
}

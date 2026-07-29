import assert from "node:assert/strict";
import test from "node:test";

import { ExperienceMutationExecutor } from "../src/desktop/main/experience-library/experience-mutation-executor.js";
import { ExperienceProposalService } from "../src/desktop/main/experience-library/experience-proposal-service.js";
import { buildLocalExperience } from "../src/desktop/main/experience-library/experience-sync-mapping.js";
import type { LocalSyncStore } from "../src/desktop/main/sync/local-sync-store.js";
import type {
  EnqueueMutation,
  LocalEntity,
  SyncIssue,
} from "../src/desktop/main/sync/local-sync-types.js";

class FakeLocalSyncStore {
  entity: LocalEntity = {
    entityType: "experience",
    entityId: "exp-1",
    entityVersion: 3,
    localVersion: 2,
    syncStatus: "clean",
    operation: "upsert",
    changedAt: "2026-07-29T00:00:00Z",
    payload: buildLocalExperience("exp-1", "rev-1", {
      category: "work",
      title: "Engineer",
      content: "Built sync",
      organization: "Coolto",
      role: "IC",
      location: "Remote",
      startDate: "2024-01",
      endDate: "present",
      tags: ["sync"],
    }, "2026-07-29T00:00:00Z"),
  };
  issue: SyncIssue | undefined;
  writes: EnqueueMutation[] = [];

  getEntity(_type: string, id: string): LocalEntity | undefined {
    return id === this.entity.entityId ? this.entity : undefined;
  }

  enqueue(mutation: EnqueueMutation): string {
    this.writes.push(mutation);
    this.apply(mutation);
    return mutation.operationId;
  }

  replaceBlocked(mutation: EnqueueMutation): void {
    this.writes.push(mutation);
    this.apply(mutation);
  }

  saveBlockedAsNew(_type: string, _id: string, mutation: EnqueueMutation): void {
    this.writes.push(mutation);
    this.entity = {
      ...this.entity,
      entityId: mutation.entityId,
      entityVersion: 0,
      payload: mutation.localPayload ?? mutation.payload,
    };
  }

  acceptServer(): void {
    if (!this.issue?.serverPayload) throw new Error("no server");
    this.entity = {
      ...this.entity,
      entityVersion: this.issue.serverVersion,
      syncStatus: "clean",
      payload: this.issue.serverPayload,
    };
  }

  getSyncIssue(): SyncIssue | undefined {
    return this.issue;
  }

  private apply(mutation: EnqueueMutation): void {
    this.entity = {
      ...this.entity,
      localVersion: this.entity.localVersion + 1,
      syncStatus: "pending",
      operation: mutation.action === "delete" ? "delete" : "upsert",
      payload: mutation.localPayload ?? mutation.payload,
    };
  }
}

function service(local: FakeLocalSyncStore) {
  const store = local as unknown as LocalSyncStore;
  return new ExperienceProposalService(
    store,
    new ExperienceMutationExecutor(store, () => undefined),
    async () => undefined,
  );
}

test("Experience update freezes a full payload and writes only after execute", async () => {
  const local = new FakeLocalSyncStore();
  const proposals = service(local);
  const proposal = await proposals.prepareUpdate("exp-1", { title: "Staff Engineer" });

  assert.equal(local.writes.length, 0);
  assert.equal(proposal.current.organization, "Coolto");
  assert.equal(proposal.next?.organization, "Coolto");
  const result = proposals.execute(proposal.id);
  assert.equal(local.writes.length, 1);
  assert.equal(local.writes[0]?.payload.organization, "Coolto");
  assert.equal(local.writes[0]?.payload.location, "Remote");
  assert.equal(result.experience?.title, "Staff Engineer");
  assert.equal(result.experience?.currentRevisionId, "rev-1");
});

test("explicit null clears one field and content change pins a local revision id", async () => {
  const local = new FakeLocalSyncStore();
  const proposals = service(local);
  const proposal = await proposals.prepareUpdate("exp-1", {
    location: null,
    content: "Built a resilient sync engine",
  });
  assert.equal(proposal.next?.location, null);
  assert.notEqual(proposal.next?.revisionId, proposal.current.revisionId);
  const result = proposals.execute(proposal.id);
  assert.equal(result.experience?.currentRevisionId, proposal.next?.revisionId);
  assert.equal(local.writes[0]?.payload.revisionId, proposal.next?.revisionId);
});

test("proposal execution rejects local-version drift", async () => {
  const local = new FakeLocalSyncStore();
  const proposals = service(local);
  const proposal = await proposals.prepareDelete("exp-1");
  local.entity = { ...local.entity, localVersion: local.entity.localVersion + 1 };
  assert.throws(
    () => proposals.execute(proposal.id),
    /经历已变化/,
  );
  assert.equal(local.writes.length, 0);
});

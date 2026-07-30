import assert from "node:assert/strict";
import test from "node:test";
import type { SyncEntityType } from "../src/sync/types.js";
import type { EnqueueMutation, LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";
import { InterviewSyncStore } from "../src/desktop/main/tracker/interview-sync-store.js";
import { InterviewProposalService } from "../src/desktop/main/tracker/interview-proposal-service.js";

class MemoryStorage {
  readonly entities = new Map<string, LocalEntity>();
  readonly mutations: EnqueueMutation[] = [];
  key(type: SyncEntityType, id: string) { return `${type}:${id}`; }
  getEntity(type: SyncEntityType, id: string) { return this.entities.get(this.key(type, id)); }
  listEntities(type: SyncEntityType) { return [...this.entities.values()].filter((item) => item.entityType === type); }
  enqueue(mutation: EnqueueMutation) {
    this.mutations.push(structuredClone(mutation));
    this.entities.set(this.key(mutation.entityType, mutation.entityId), {
      entityType: mutation.entityType, entityId: mutation.entityId,
      entityVersion: mutation.expectedVersion ?? 0, localVersion: 1, syncStatus: "pending",
      operation: mutation.action === "delete" ? "delete" : "upsert",
      changedAt: mutation.createdAt!, payload: structuredClone(mutation.localPayload ?? mutation.payload),
    });
    return mutation.operationId;
  }
}

const input = {
  roundNumber: 1, interviewType: "video" as const, scheduledAt: "2026-07-30T02:00:00.000Z",
  timezone: "Asia/Hong_Kong", durationMinutes: 60, status: "scheduled" as const,
};

test("面试 Proposal 确认前不写 Outbox，确认后只写一次", async () => {
  const memory = new MemoryStorage();
  memory.entities.set("application:app", applicationEntity());
  const store = new InterviewSyncStore(memory, () => undefined, async () => undefined);
  const proposals = new InterviewProposalService(store);
  const proposal = await proposals.prepareCreate("app", input);
  assert.equal(memory.mutations.length, 0);
  const created = await proposals.execute(proposal.id);
  assert.equal(created.id, proposal.next?.id);
  assert.equal(memory.mutations.length, 1);
  await assert.rejects(() => proposals.execute(proposal.id), /失效/);
});

test("面试 Proposal 在记录漂移后拒绝执行", async () => {
  const memory = new MemoryStorage();
  memory.entities.set("application:app", applicationEntity());
  const store = new InterviewSyncStore(memory, () => undefined, async () => undefined);
  const created = await store.create("app", input, "round");
  const proposals = new InterviewProposalService(store);
  const proposal = await proposals.prepareUpdate(created.id, { ...input, interviewer: "Lin" });
  memory.getEntity("interview_round", created.id)!.payload.updatedAt = "2026-07-31T00:00:00.000Z";
  await assert.rejects(() => proposals.execute(proposal.id), /发生变化/);
  assert.equal(memory.mutations.length, 1);
});

test("面试 Proposal 执行失败后保留，可修正外部条件再重试", async () => {
  const memory = new MemoryStorage();
  memory.entities.set("application:app", applicationEntity());
  const store = new InterviewSyncStore(memory, () => undefined, async () => undefined);
  const proposals = new InterviewProposalService(store);
  const proposal = await proposals.prepareCreate("app", input);
  memory.entities.delete("application:app");
  await assert.rejects(() => proposals.execute(proposal.id), /投递记录不存在/);
  memory.entities.set("application:app", applicationEntity());
  const created = await proposals.execute(proposal.id);
  assert.equal(created.id, proposal.next?.id);
  assert.equal(memory.mutations.length, 1);
});

function applicationEntity(): LocalEntity {
  return { entityType: "application", entityId: "app", entityVersion: 1, localVersion: 1,
    syncStatus: "clean", operation: "upsert", changedAt: "2026-07-29T00:00:00.000Z",
    payload: {} };
}

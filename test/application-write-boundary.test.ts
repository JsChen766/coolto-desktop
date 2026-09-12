import assert from "node:assert/strict";
import test from "node:test";

import { APPLICATION_IPC_CHANNELS } from "../src/desktop/main/application-library/application-ipc.js";
import { ApplicationProposalService } from "../src/desktop/main/application-library/application-proposal-service.js";
import { ApplicationSyncStore } from "../src/desktop/main/application-library/application-sync-store.js";
import type { EnqueueMutation, LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";
import type { SyncEntityType } from "../src/sync/types.js";
import { createDemoApplicationApi } from "../src/desktop/renderer/src/lib/demo/demo-application-api.js";

const now = "2026-09-08T00:00:00.000Z";

test("Application IPC has no Renderer direct-write channels", () => {
  assert.deepEqual(
    APPLICATION_IPC_CHANNELS.filter((channel) =>
      /applications:(create|update|transition|delete)$/u.test(channel),
    ),
    [],
  );
});

test("Application Desktop API exposes only proposal-backed writes", async () => {
  const api = createDemoApplicationApi(new Date(now));
  assert.deepEqual(
    Object.keys(api).filter((key) => ["create", "update", "transition", "delete"].includes(key)),
    [],
  );
  assert.equal(typeof api.prepareCreate, "function");
  assert.equal(typeof api.references, "function");
  assert.equal(typeof api.prepareUpdate, "function");
  assert.equal(typeof api.prepareTransition, "function");
  assert.equal(typeof api.prepareDelete, "function");
  assert.equal(typeof api.executeProposal, "function");
});

test("Application proposal preparation does not write before approval", async () => {
  const { storage, proposals } = harness();
  const proposal = await proposals.prepareCreate(createInput());
  assert.equal(storage.operations.length, 0);

  const result = await proposals.execute(proposal.id);
  assert.ok("companyName" in result);
  assert.equal(result.jdId, "jd-1");
  assert.equal(result.resumeId, "resume-1");
  assert.equal(result.jdTitleSnapshot, "JD snapshot");
  assert.equal(result.resumeTitleSnapshot, "Resume snapshot");
  assert.equal(result.resumeContentHashSnapshot, "a".repeat(64));
  assert.equal(storage.operations.length, 1);
  assert.equal(storage.operations[0]?.operationId, "create-op");
  await assert.rejects(() => proposals.execute(proposal.id), /确认内容已失效/u);
  assert.equal(storage.operations.length, 1);
});

test("Application create rejects missing references and asset drift", async () => {
  const missing = harness();
  await assert.rejects(
    () => missing.proposals.prepareCreate({ ...createInput(), resumeId: null }),
    /请选择实际投递的 Resume/u,
  );
  assert.equal(missing.storage.operations.length, 0);

  const drift = harness();
  const proposal = await drift.proposals.prepareCreate(createInput());
  drift.storage.seed("resume", "resume-1", {
    title: "Resume renamed",
    contentHash: "b".repeat(64),
  });
  await assert.rejects(
    () => drift.proposals.execute(proposal.id),
    /投递 JD 或 Resume 已变化/u,
  );
  assert.equal(drift.storage.operations.length, 0);
});

test("Application proposals reject local-version drift before writing", async () => {
  const transitionHarness = harness(true);
  const transition = await transitionHarness.proposals.prepareTransition("app-1", {
    toStatus: "screening",
  });
  transitionHarness.storage.touch("application", "app-1", applicationPayload());
  await assert.rejects(
    () => transitionHarness.proposals.execute(transition.id),
    /投递记录已变化/u,
  );
  assert.equal(transitionHarness.storage.operations.length, 0);

  const createHarness = harness();
  const create = await createHarness.proposals.prepareCreate(createInput());
  createHarness.storage.touch("resume", "resume-1", {
    title: "Resume snapshot",
    contentHash: "a".repeat(64),
  });
  await assert.rejects(
    () => createHarness.proposals.execute(create.id),
    /投递 JD 或 Resume 已变化/u,
  );
  assert.equal(createHarness.storage.operations.length, 0);
});
test("Application transition and delete proposals recheck version and execute once", async () => {
  const stale = harness(true);
  const transition = await stale.proposals.prepareTransition("app-1", {
    toStatus: "screening",
    reason: "contacted",
  });
  stale.storage.seed("application", "app-1", applicationPayload(), 2);
  await assert.rejects(
    () => stale.proposals.execute(transition.id),
    /投递记录已变化/u,
  );
  assert.equal(stale.storage.operations.length, 0);

  const staleDelete = harness(true);
  const deleteProposal = await staleDelete.proposals.prepareDelete("app-1");
  staleDelete.storage.touch("application", "app-1", applicationPayload());
  await assert.rejects(
    () => staleDelete.proposals.execute(deleteProposal.id),
    /投递记录已变化/u,
  );
  assert.equal(staleDelete.storage.operations.length, 0);

  const ready = harness(true);
  const readyDelete = await ready.proposals.prepareDelete("app-1");
  const result = await ready.proposals.execute(readyDelete.id);
  assert.ok("deletedAt" in result && !("companyName" in result));
  assert.equal(ready.storage.operations.at(-1)?.action, "delete");
  assert.equal(ready.storage.operations.at(-1)?.operationId, readyDelete.id);
  await assert.rejects(() => ready.proposals.execute(readyDelete.id), /确认内容已失效/u);
});

test("Application proposals are scoped to the owner service instance", async () => {
  const { storage, store, proposals } = harness();
  const proposal = await proposals.prepareCreate(createInput());
  const otherOwner = new ApplicationProposalService(storage, store);
  await assert.rejects(() => otherOwner.execute(proposal.id), /确认内容已失效/u);
  assert.equal(storage.operations.length, 0);
});

test("receipt recovery matches a frozen submission key after service restart", async () => {
  const first = harness();
  const proposal = await first.proposals.prepareCreate({
    ...createInput(),
    dedupeKey: "submission-key",
  });
  const created = await first.proposals.execute(proposal.id);
  assert.ok("companyName" in created);

  const restarted = new ApplicationProposalService(first.storage, first.store);
  const recovered = await restarted.findExistingBySubmissionKey({
    dedupeKey: "submission-key",
    jdId: "jd-1",
    resumeId: "resume-1",
    resumeContentHash: "a".repeat(64),
  });
  assert.equal(recovered?.id, created.id);
  await assert.rejects(
    () => restarted.findExistingBySubmissionKey({
      dedupeKey: "submission-key",
      jdId: "jd-1",
      resumeId: "resume-1",
      resumeContentHash: "b".repeat(64),
    }),
    /投递恢复键不匹配/u,
  );
  await assert.rejects(
    () => restarted.findExistingBySubmissionKey({
      dedupeKey: "submission-key",
      jdId: "other-jd",
      resumeId: "resume-1",
      resumeContentHash: "a".repeat(64),
    }),
    /投递恢复键不匹配/u,
  );
  first.storage.seed("application", "app-2", {
    ...applicationPayload(),
    id: "app-2",
  });
  await assert.rejects(
    () => restarted.findExistingBySubmissionKey({
      dedupeKey: "submission-key",
      jdId: "jd-1",
      resumeId: "resume-1",
      resumeContentHash: "a".repeat(64),
    }),
    /匹配到多条 Application/u,
  );
  assert.equal(first.storage.operations.length, 1);
});
function harness(withApplication = false): {
  storage: BoundaryStorage;
  store: ApplicationSyncStore;
  proposals: ApplicationProposalService;
} {
  const storage = new BoundaryStorage();
  storage.seed("job_description", "jd-1", { title: "JD snapshot" });
  storage.seed("resume", "resume-1", {
    title: "Resume snapshot",
    contentHash: "a".repeat(64),
  });
  if (withApplication) storage.seed("application", "app-1", applicationPayload(), 1);
  const store = new ApplicationSyncStore(storage, () => {}, async () => {});
  return { storage, store, proposals: new ApplicationProposalService(storage, store) };
}

function createInput() {
  return {
    jdId: "jd-1",
    resumeId: "resume-1",
    companyName: "Coolto",
    roleName: "Engineer",
    deliveryMethod: "manual" as const,
    appliedAt: now,
  };
}

function applicationPayload(): Record<string, unknown> {
  return {
    id: "app-1", jdId: "jd-1", resumeId: "resume-1",
    companyName: "Coolto", roleName: "Engineer",
    jdTitleSnapshot: "JD snapshot", resumeTitleSnapshot: "Resume snapshot",
    resumeContentHashSnapshot: "a".repeat(64), deliveryMethod: "manual",
    targetUrl: null, appliedAt: now, status: "applied", pendingConfirmation: false,
    source: "manual", dedupeKey: "submission-key", companyBusiness: null,
    roleSummary: null, companyCulture: null, rejectionReason: null,
    entityVersion: 1, createdAt: now, updatedAt: now,
  };
}

class BoundaryStorage {
  readonly operations: EnqueueMutation[] = [];
  readonly #entities = new Map<string, LocalEntity>();

  public seed(
    entityType: SyncEntityType,
    entityId: string,
    payload: Record<string, unknown>,
    entityVersion = 1,
  ): void {
    this.#entities.set(`${entityType}\0${entityId}`, {
      entityType, entityId, entityVersion, localVersion: 1,
      syncStatus: "clean", operation: "upsert", changedAt: now,
      payload: structuredClone(payload),
    });
  }
  public touch(
    entityType: SyncEntityType,
    entityId: string,
    payload: Record<string, unknown>,
  ): void {
    const entity = this.getEntity(entityType, entityId);
    if (!entity) throw new Error("test entity missing");
    this.#entities.set(`${entityType}\0${entityId}`, {
      ...entity,
      localVersion: entity.localVersion + 1,
      payload: structuredClone(payload),
    });
  }

  public getEntity(entityType: SyncEntityType, entityId: string): LocalEntity | undefined {
    return this.#entities.get(`${entityType}\0${entityId}`);
  }

  public listEntities(entityType: SyncEntityType): LocalEntity[] {
    return [...this.#entities.values()].filter((entity) => entity.entityType === entityType);
  }

  public resolveCreateIdentity(): { entityId: string; operationId: string } {
    return { entityId: "app-created", operationId: "create-op" };
  }

  public enqueue(mutation: EnqueueMutation): string {
    this.operations.push(structuredClone(mutation));
    const previous = this.getEntity(mutation.entityType, mutation.entityId);
    this.#entities.set(`${mutation.entityType}\0${mutation.entityId}`, {
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      entityVersion: mutation.action === "create"
        ? 1 : (mutation.expectedVersion ?? 0) + 1,
      localVersion: (previous?.localVersion ?? 0) + 1,
      syncStatus: "pending",
      operation: mutation.action === "delete" ? "delete" : "upsert",
      changedAt: mutation.createdAt ?? now,
      payload: structuredClone(mutation.localPayload ?? mutation.payload),
    });
    return mutation.operationId;
  }
}


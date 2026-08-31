import assert from "node:assert/strict";
import test from "node:test";

import { ResumeSyncStore } from "../src/desktop/main/resume-library/resume-sync-store.js";
import type { LocalSyncStore } from "../src/desktop/main/sync/local-sync-store.js";
import type {
  EnqueueMutation,
  LocalEntity,
} from "../src/desktop/main/sync/local-sync-types.js";
import type { ResumeSaveApprovalPayload } from "../src/resume/save/types.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";

test("new resume save reuses its local identity after draft linking fails", async () => {
  const fake = new ResumeStoreFake();
  let linkAttempts = 0;
  const store = new ResumeSyncStore(
    fake as unknown as LocalSyncStore,
    () => undefined,
    async () => undefined,
    async () => {
      linkAttempts += 1;
      if (linkAttempts === 1) throw new Error("draft link failed");
    },
  );
  const payload = await savePayload();
  await assert.rejects(store.publishNew(payload, "stable-save"), /draft link failed/u);

  const retry: ResumeSaveApprovalPayload = {
    ...payload,
    proposalId: "proposal-retry",
    observation: {
      ...payload.observation,
      idempotency_key: "proposal-retry:layout",
    },
  };
  const result = await store.publishNew(retry, "stable-save");

  assert.equal(result.id, "resume-stable-id");
  assert.equal(fake.enqueued.length, 1, "retry must not enqueue a duplicate create");
  assert.equal(linkAttempts, 2);
});

test("publishing a general resume keeps jdId null in the local Outbox", async () => {
  const fake = new ResumeStoreFake();
  const resumes = new ResumeSyncStore(
    fake as unknown as LocalSyncStore,
    () => undefined,
    async () => undefined,
    async () => undefined,
  );
  const { store, proposalBuilder, ready } = await createReadySaveFixture();
  ready.sourceSnapshot = {
    ...ready.sourceSnapshot,
    generationStrategy: "general",
    jd: null,
  };
  store.replace(ready, ready.revision);
  const payload = proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "通用简历",
    mode: "new_resume",
  });

  await resumes.publishNew(payload, "general-save");

  assert.equal(fake.enqueued[0]?.payload.jdId, null);
  assert.equal(fake.enqueued[0]?.localPayload?.jdId, null);
});

async function savePayload(): Promise<ResumeSaveApprovalPayload> {
  const { proposalBuilder, ready } = await createReadySaveFixture();
  return proposalBuilder.build({
    candidateId: ready.candidateId,
    expectedRevision: ready.revision,
    title: "产品经理简历",
    mode: "new_resume",
  });
}

class ResumeStoreFake {
  public readonly enqueued: EnqueueMutation[] = [];
  private entity: LocalEntity | undefined;
  private identityRequest = "";

  public resolveCreateIdentity(_type: string, _key: string, request: unknown) {
    const serialized = JSON.stringify(request);
    if (this.identityRequest && this.identityRequest !== serialized) {
      throw new Error("idempotencyKey 已被另一条创建请求使用");
    }
    this.identityRequest = serialized;
    return { entityId: "resume-stable-id", operationId: "operation-stable-id" };
  }

  public getEntity(): LocalEntity | undefined {
    return this.entity;
  }

  public enqueue(input: EnqueueMutation): string {
    this.enqueued.push(structuredClone(input));
    this.entity = {
      entityType: "resume",
      entityId: input.entityId,
      entityVersion: 0,
      localVersion: 1,
      syncStatus: "pending",
      operation: "upsert",
      changedAt: "2026-08-18T00:00:00.000Z",
      payload: structuredClone(input.localPayload ?? {}),
    };
    return input.operationId;
  }
}

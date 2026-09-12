import assert from "node:assert/strict";
import test from "node:test";

import { ApplicationProposalService } from "../src/desktop/main/application-library/application-proposal-service.js";
import { ApplicationSyncStore } from "../src/desktop/main/application-library/application-sync-store.js";
import type { EnqueueMutation, LocalEntity } from "../src/desktop/main/sync/local-sync-types.js";
import type { SyncEntityType } from "../src/sync/types.js";

const now = "2026-09-08T00:00:00.000Z";
const hash = "a".repeat(64);

type AssetMutation = { name: string; apply: (storage: AssetStorage) => void };

const assetMutations: AssetMutation[] = [
  { name: "JD deletion", apply: (storage) => storage.remove("job_description", "jd-1") },
  { name: "Resume deletion", apply: (storage) => storage.remove("resume", "resume-1") },
  {
    name: "JD title drift",
    apply: (storage) => storage.touch("job_description", "jd-1", { title: "Renamed JD" }),
  },
  {
    name: "Resume title drift",
    apply: (storage) => storage.touch("resume", "resume-1", {
      title: "Renamed Resume", contentHash: hash,
    }),
  },
  {
    name: "JD localVersion drift",
    apply: (storage) => storage.touch("job_description", "jd-1", { title: "JD snapshot" }),
  },
  {
    name: "Resume localVersion drift",
    apply: (storage) => storage.touch("resume", "resume-1", {
      title: "Resume snapshot", contentHash: hash,
    }),
  },
  {
    name: "Resume hash drift",
    apply: (storage) => storage.touch("resume", "resume-1", {
      title: "Resume snapshot", contentHash: "b".repeat(64),
    }),
  },
];

for (const mutation of assetMutations) {
  test(`transition proposal rejects ${mutation.name} before writing`, async () => {
    await assertAssetDrift("transition", mutation);
  });
  test(`delete proposal rejects ${mutation.name} before writing`, async () => {
    await assertAssetDrift("delete", mutation);
  });
}

async function assertAssetDrift(
  kind: "transition" | "delete",
  mutation: AssetMutation,
): Promise<void> {
  const storage = new AssetStorage();
  seedReferences(storage);
  storage.seed("application", "app-1", applicationPayload());
  const store = new ApplicationSyncStore(storage, () => {}, async () => {});
  const proposals = new ApplicationProposalService(storage, store);
  const proposal = kind === "transition"
    ? await proposals.prepareTransition("app-1", { toStatus: "screening" })
    : await proposals.prepareDelete("app-1");

  mutation.apply(storage);
  await assert.rejects(
    () => proposals.execute(proposal.id),
    /投递 JD 或 Resume 已变化，请重新检查后再确认/u,
  );
  assert.equal(storage.operations.length, 0);
}

function seedReferences(storage: AssetStorage): void {
  storage.seed("job_description", "jd-1", { title: "JD snapshot" });
  storage.seed("resume", "resume-1", { title: "Resume snapshot", contentHash: hash });
}

function applicationPayload(): Record<string, unknown> {
  return {
    id: "app-1", jdId: "jd-1", resumeId: "resume-1",
    companyName: "Coolto", roleName: "Engineer",
    jdTitleSnapshot: "JD snapshot", resumeTitleSnapshot: "Resume snapshot",
    resumeContentHashSnapshot: hash, deliveryMethod: "manual", targetUrl: null,
    appliedAt: now, status: "applied", pendingConfirmation: false, source: "manual",
    dedupeKey: "submission-key", companyBusiness: null, roleSummary: null,
    companyCulture: null, rejectionReason: null, entityVersion: 1,
    createdAt: now, updatedAt: now,
  };
}

class AssetStorage {
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
      ...entity, localVersion: entity.localVersion + 1, operation: "upsert",
      payload: structuredClone(payload),
    });
  }

  public remove(entityType: SyncEntityType, entityId: string): void {
    const entity = this.getEntity(entityType, entityId);
    if (!entity) throw new Error("test entity missing");
    this.#entities.set(`${entityType}\0${entityId}`, {
      ...entity, localVersion: entity.localVersion + 1, operation: "delete",
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
    return mutation.operationId;
  }
}

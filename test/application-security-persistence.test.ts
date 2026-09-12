import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { ApplicationProposalService } from "../src/desktop/main/application-library/application-proposal-service.js";
import { ApplicationSyncStore } from "../src/desktop/main/application-library/application-sync-store.js";
import { LocalCreateIdentityStore } from "../src/desktop/main/sync/local-create-identity-store.js";
import { LocalEntityStore } from "../src/desktop/main/sync/local-entity-store.js";
import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";
import type { EnqueueMutation } from "../src/desktop/main/sync/local-sync-types.js";
import { LocalOutboxStore } from "../src/desktop/main/sync/local-outbox-store.js";
import { SyncPayloadCodec } from "../src/desktop/main/sync/payload-codec.js";
import type { SyncEntityType } from "../src/sync/types.js";

const now = "2026-09-08T00:00:00.000Z";
const hash = "a".repeat(64);

test("receipt recovery scans durable same-key candidates after SQLite restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-application-sync-"));
  const path = join(directory, "local-sync.sqlite");
  const key = Buffer.alloc(32, 11);
  let storage: PersistentApplicationStorage | undefined;
  try {
    const firstDatabase = new DatabaseSync(path);
    initializeLocalSyncSchema(firstDatabase);
    seed(firstDatabase, key, "job_description", "jd-1", { title: "JD snapshot" });
    seed(firstDatabase, key, "resume", "resume-1", {
      title: "Resume snapshot", contentHash: hash,
    });
    storage = new PersistentApplicationStorage(firstDatabase, key);
    const firstStore = new ApplicationSyncStore(storage, () => {}, async () => {});
    const firstProposals = new ApplicationProposalService(storage, firstStore);
    const proposal = await firstProposals.prepareCreate(createInput());
    const created = await firstProposals.execute(proposal.id);
    assert.ok("companyName" in created);
    assert.equal(storage.outboxCount(), 1);
    storage.close();
    storage = undefined;

    const reopenedDatabase = new DatabaseSync(path);
    initializeLocalSyncSchema(reopenedDatabase);
    storage = new PersistentApplicationStorage(reopenedDatabase, key);
    const restartedStore = new ApplicationSyncStore(storage, () => {}, async () => {});
    const restarted = new ApplicationProposalService(storage, restartedStore);
    const recovered = await restarted.findExistingBySubmissionKey({
      dedupeKey: "submission-key", jdId: "jd-1", resumeId: "resume-1", resumeContentHash: hash,
    });
    assert.equal(recovered?.id, created.id);

    const baselineWrites = storage.outboxCount();
    const validRecovery = {
      dedupeKey: "submission-key", jdId: "jd-1", resumeId: "resume-1", resumeContentHash: hash,
    };
    assert.equal(
      await restarted.findExistingBySubmissionKey({
        ...validRecovery, dedupeKey: "missing-key",
      }),
      undefined,
    );
    assert.equal(storage.outboxCount(), baselineWrites);
    const invalidRecoveryInputs = [
      { field: "dedupeKey", value: "" },
      { field: "dedupeKey", value: " " },
      { field: "dedupeKey", value: " submission-key" },
      { field: "dedupeKey", value: "submission-key " },
      { field: "jdId", value: "" },
      { field: "jdId", value: " " },
      { field: "jdId", value: " jd-1" },
      { field: "jdId", value: "jd-1 " },
      { field: "resumeId", value: "" },
      { field: "resumeId", value: " " },
      { field: "resumeId", value: " resume-1" },
      { field: "resumeId", value: "resume-1 " },
      { field: "resumeContentHash", value: "" },
      { field: "resumeContentHash", value: " " },
      { field: "resumeContentHash", value: ` ${hash}` },
      { field: "resumeContentHash", value: `${hash} ` },
    ] as const;
    for (const { field, value } of invalidRecoveryInputs) {
      await assert.rejects(
        () => restarted.findExistingBySubmissionKey({ ...validRecovery, [field]: value }),
        /投递恢复键参数无效/u,
      );
      assert.equal(storage.outboxCount(), baselineWrites);
    }
    await assert.rejects(
      () => restarted.findExistingBySubmissionKey({
        ...validRecovery, resumeContentHash: "b".repeat(64),
      }),
      /投递恢复键不匹配/u,
    );
    assert.equal(storage.outboxCount(), baselineWrites);
    await assert.rejects(
      () => restarted.findExistingBySubmissionKey({
        ...validRecovery, jdId: "other-jd",
      }),
      /投递恢复键不匹配/u,
    );
    assert.equal(storage.outboxCount(), baselineWrites);
    await assert.rejects(
      () => restarted.findExistingBySubmissionKey({
        ...validRecovery, resumeId: "other-resume",
      }),
      /投递恢复键不匹配/u,
    );
    assert.equal(storage.outboxCount(), baselineWrites);

    const current = storage.getEntity("application", created.id);
    assert.ok(current);
    storage.insertProjection("application", "app-2", {
      ...current.payload, id: "app-2",
    });
    await assert.rejects(
      () => restarted.findExistingBySubmissionKey({
        dedupeKey: "submission-key", jdId: "jd-1", resumeId: "resume-1", resumeContentHash: hash,
      }),
      /匹配到多条 Application/u,
    );
    assert.equal(storage.outboxCount(), baselineWrites);
    storage.insertProjection("application", "app-3", {
      ...current.payload, id: "app-3", resumeContentHashSnapshot: "b".repeat(64),
    });
    await assert.rejects(
      () => restarted.findExistingBySubmissionKey({
        dedupeKey: "submission-key", jdId: "jd-1", resumeId: "resume-1", resumeContentHash: hash,
      }),
      /匹配到多条 Application/u,
    );
    assert.equal(storage.outboxCount(), baselineWrites);
  } finally {
    storage?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

function createInput() {
  return {
    jdId: "jd-1", resumeId: "resume-1", companyName: "Coolto", roleName: "Engineer",
    deliveryMethod: "manual" as const, appliedAt: now, dedupeKey: "submission-key",
  };
}

class PersistentApplicationStorage {
  readonly #entities: LocalEntityStore;
  readonly #outbox: LocalOutboxStore;
  readonly #identities: LocalCreateIdentityStore;
  readonly #codec: SyncPayloadCodec;

  public constructor(
    private readonly database: DatabaseSync,
    key: Buffer,
  ) {
    this.#codec = new SyncPayloadCodec(key);
    this.#entities = new LocalEntityStore(database, this.#codec);
    this.#outbox = new LocalOutboxStore(database, this.#codec);
    this.#identities = new LocalCreateIdentityStore(database);
  }

  public getEntity(entityType: SyncEntityType, entityId: string) {
    return this.#entities.get(entityType, entityId);
  }

  public listEntities(entityType: SyncEntityType) {
    return this.#entities.list(entityType);
  }

  public resolveCreateIdentity(
    entityType: SyncEntityType,
    idempotencyKey: string,
    request: unknown,
  ) {
    return this.#identities.resolve(entityType, idempotencyKey, request);
  }

  public enqueue(mutation: EnqueueMutation): string {
    return this.#outbox.enqueue(mutation);
  }

  public outboxCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM local_outbox").get() as { count: number };
    return row.count;
  }

  public insertProjection(
    entityType: SyncEntityType,
    entityId: string,
    payload: Record<string, unknown>,
  ): void {
    this.database.prepare(`
      INSERT INTO sync_entities (
        entity_type, entity_id, entity_version, local_version, sync_status,
        operation, changed_at, payload
      ) VALUES (?, ?, 1, 1, 'clean', 'upsert', ?, ?)
    `).run(entityType, entityId, now, this.#codec.encode(payload));
  }

  public close(): void {
    this.database.close();
  }
}

function seed(
  database: DatabaseSync,
  key: Buffer,
  entityType: SyncEntityType,
  entityId: string,
  payload: Record<string, unknown>,
): void {
  const codec = new SyncPayloadCodec(key);
  database.prepare(`
    INSERT INTO sync_entities (
      entity_type, entity_id, entity_version, local_version, sync_status,
      operation, changed_at, payload
    ) VALUES (?, ?, 1, 1, 'clean', 'upsert', ?, ?)
  `).run(entityType, entityId, now, codec.encode(payload));
}

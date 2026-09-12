import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { canonicalHash } from "../src/agent-task/canonical-hash.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import { ApplicationSubmissionService } from
  "../src/desktop/main/agent-task/application-submission-service.js";
import { ApplicationProposalService } from
  "../src/desktop/main/application-library/application-proposal-service.js";
import { ApplicationSyncStore } from
  "../src/desktop/main/application-library/application-sync-store.js";
import { LocalCreateIdentityStore } from
  "../src/desktop/main/sync/local-create-identity-store.js";
import { LocalEntityStore } from "../src/desktop/main/sync/local-entity-store.js";
import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";
import type { EnqueueMutation } from "../src/desktop/main/sync/local-sync-types.js";
import { LocalOutboxStore } from "../src/desktop/main/sync/local-outbox-store.js";
import { SyncPayloadCodec } from "../src/desktop/main/sync/payload-codec.js";
import type { SyncEntityType } from "../src/sync/types.js";

const now = "2026-09-08T00:00:00.000Z";
const hash = "a".repeat(64);
const targetUrl = "https://jobs.example/apply";

test("receipt recovery links the durable Application after SQLite reopen", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coolto-receipt-recovery-"));
  const path = join(directory, "local-sync.sqlite");
  const key = Buffer.alloc(32, 13);
  const ownerId = "owner";
  const harness = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  let storage: PersistentApplicationStorage | undefined;
  try {
    const task = await harness.tasks.create("conversation", "Recover submission receipt");
    await harness.grants.create({
      ownerId, taskId: task.id, taskGoalHash: task.goalHash,
      allowedDomains: ["jobs.example"], blockedDomains: [],
      allowedActions: ["browser.submit", "tracker.application.create", "task.lifecycle"],
      jobCriteria: {},
      assetPolicy: {
        resumeId: "resume-1", resumeTitle: "Resume snapshot",
        resumeContentHash: hash, submissionMode: "confirm_each",
      },
      answerPolicy: {}, submissionBudget: {}, unattended: true,
      validFrom: new Date(Date.now() - 1_000).toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      policyVersion: "test", confirmedByUserAt: now,
    });
    const run = await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });

    const firstDatabase = new DatabaseSync(path);
    initializeLocalSyncSchema(firstDatabase);
    seed(firstDatabase, key, "job_description", "jd-1", { title: "JD snapshot" });
    seed(firstDatabase, key, "resume", "resume-1", {
      title: "Resume snapshot", contentHash: hash,
    });
    storage = new PersistentApplicationStorage(firstDatabase, key);
    const firstStore = new ApplicationSyncStore(storage, () => {}, async () => {});
    const firstProposals = new ApplicationProposalService(storage, firstStore);
    const input = {
      jdId: "jd-1", resumeId: "resume-1", companyName: "Coolto",
      roleName: "Engineer", deliveryMethod: "form_fill" as const,
      targetUrl, appliedAt: now, pendingConfirmation: false,
      source: "browser" as const,
      dedupeKey: canonicalHash({ jdId: "jd-1", resumeId: "resume-1", targetUrl }),
    };
    const proposal = await firstProposals.prepareCreate(input);
    const durable = await firstProposals.execute(proposal.id);
    assert.ok("companyName" in durable);
    assert.equal(storage.outboxCount(), 1);

    const intent = await harness.submissions.createIntent({
      taskId: task.id, runId: run.id, actionTokenId: null,
      applicationProposalId: proposal.id, jdId: "jd-1", resumeId: "resume-1",
      resumeTitle: "Resume snapshot", resumeContentHash: hash,
      company: "Coolto", role: "Engineer", targetUrl,
      tabId: "tab-1", submitFillId: "submit-1", preparedAt: now,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const receipt = await harness.submissions.createReceipt({
      taskId: task.id, runId: run.id, intentId: intent.id,
      actionReceiptId: "action-1", jdId: "jd-1", resumeId: "resume-1",
      resumeContentHash: hash, company: "Coolto", role: "Engineer", targetUrl,
      siteApplicationId: null, status: "confirmed", applicationId: null,
      userConfirmedAt: now, createdAt: now,
    });

    storage.close();
    storage = undefined;
    const reopenedDatabase = new DatabaseSync(path);
    initializeLocalSyncSchema(reopenedDatabase);
    storage = new PersistentApplicationStorage(reopenedDatabase, key);
    const restartedStore = new ApplicationSyncStore(storage, () => {}, async () => {});
    const restartedProposals = new ApplicationProposalService(storage, restartedStore);
    const submitCalls: string[] = [];
    const browser = {
      submitElement: async (fillId: string) => { submitCalls.push(fillId); },
    } as unknown as BrowserAgentController;
    const service = new ApplicationSubmissionService(
      "conversation", harness, browser, {} as never, {} as never,
      restartedProposals, { cleanupTask: async () => undefined } as never,
    );

    const recovered = await service.syncReceipt(receipt.id);
    assert.equal(recovered.applicationId, durable.id);
    assert.equal(storage.outboxCount(), 1);
    assert.equal((await restartedStore.listApplications()).items.length, 1);
    assert.deepEqual(submitCalls, []);
  } finally {
    storage?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

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
  public resolveCreateIdentity(entityType: SyncEntityType, idempotencyKey: string, request: unknown) {
    return this.#identities.resolve(entityType, idempotencyKey, request);
  }
  public enqueue(mutation: EnqueueMutation): string {
    return this.#outbox.enqueue(mutation);
  }
  public outboxCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM local_outbox").get() as { count: number };
    return row.count;
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

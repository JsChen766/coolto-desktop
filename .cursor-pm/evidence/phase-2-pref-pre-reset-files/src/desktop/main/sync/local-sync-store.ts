import { chmod, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { app } from "electron";

import type {
  LocalSyncState,
  SyncEntityType,
  SyncOperationResult,
  SyncPage,
} from "../../../sync/types.js";
import { syncScopeKey } from "../../../privacy/local-scope.js";
import { initializeLocalSyncSchema } from "./local-sync-schema.js";
import type {
  EnqueueMutation,
  LocalEntity,
  LocalPayloadMerger,
  PendingOperation,
  SyncIssue,
} from "./local-sync-types.js";
import { LocalEntityStore } from "./local-entity-store.js";
import { LocalOutboxStore } from "./local-outbox-store.js";
import {
  LocalCreateIdentityStore,
  type LocalCreateIdentity,
} from "./local-create-identity-store.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { RemotePageWriter } from "./remote-page-writer.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";
import { SyncKeyStore } from "./sync-key-store.js";
import { SyncRecoveryStore } from "./sync-recovery-store.js";
import { ReminderDeliveryStore } from "./reminder-delivery-store.js";
import {
  assertOwnedSyncDirectoryTarget,
} from "./sync-directory.js";

interface StateRow {
  mode: LocalSyncState["mode"];
  cursor: string;
}

export class LocalSyncStore {
  readonly #outbox: LocalOutboxStore;
  readonly #remote: RemotePageWriter;
  readonly #createIdentities: LocalCreateIdentityStore;
  readonly #entities: LocalEntityStore;
  readonly #recovery: SyncRecoveryStore;
  readonly #reminderDeliveries: ReminderDeliveryStore;

  private constructor(
    private readonly database: DatabaseSync,
    codec: SyncPayloadCodec,
    private readonly directory: string,
    private readonly mergeLocalPayload?: LocalPayloadMerger,
  ) {
    this.#outbox = new LocalOutboxStore(database, codec, mergeLocalPayload);
    this.#remote = new RemotePageWriter(database, codec, mergeLocalPayload);
    this.#createIdentities = new LocalCreateIdentityStore(database);
    this.#entities = new LocalEntityStore(database, codec);
    this.#recovery = new SyncRecoveryStore(database, codec, mergeLocalPayload);
    this.#reminderDeliveries = new ReminderDeliveryStore(database);
  }

  public static async open(
    apiBaseUrl: string,
    userId: string,
    mergeLocalPayloadFactory?: (
      database: DatabaseSync,
      ownerId: string,
    ) => LocalPayloadMerger,
  ): Promise<LocalSyncStore> {
    const directory = syncDirectory(apiBaseUrl, userId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const key = await new SyncKeyStore(directory).loadOrCreate();
    const databasePath = join(directory, "local-sync.sqlite");
    const database = new DatabaseSync(databasePath);
    try {
      await chmod(databasePath, 0o600);
      initializeLocalSyncSchema(database);
      const merger = mergeLocalPayloadFactory?.(database, userId);
      return new LocalSyncStore(database, new SyncPayloadCodec(key), directory, merger);
    } catch (error: unknown) {
      database.close();
      throw error;
    }

  }
  public close(): void {
    this.database.close();
  }
  public async removeLocalDirectory(): Promise<void> {
    const root = join(app.getPath("userData"), "sync");
    await assertOwnedSyncDirectoryTarget(root, this.directory);
    await rm(this.directory, { recursive: true, force: true });
  }

  public getState(): LocalSyncState | undefined {
    return this.database
      .prepare("SELECT mode, cursor FROM sync_state WHERE singleton = 1")
      .get() as StateRow | undefined;
  }

  public resetForBootstrap(): void {
    this.#remote.resetForBootstrap();
  }

  public applyBootstrapPage(page: SyncPage): void {
    this.#remote.apply(page, page.hasMore ? "bootstrap" : "pull");
  }

  public applyPullPage(page: SyncPage): void {
    this.#remote.apply(page, "pull");
  }

  public enqueue(mutation: EnqueueMutation): string {
    return this.#outbox.enqueue(mutation);
  }

  public enqueueMany(mutations: readonly EnqueueMutation[]): string[] {
    return this.#outbox.enqueueMany(mutations);
  }

  public resolveCreateIdentity(
    entityType: SyncEntityType,
    idempotencyKey: string,
    request: unknown,
  ): LocalCreateIdentity {
    return this.#createIdentities.resolve(entityType, idempotencyKey, request);
  }

  public listReadyOperations(
    now = new Date().toISOString(),
    limit = 100,
  ): PendingOperation[] {
    return this.#outbox.listReady(now, limit);
  }

  public applyOperationResult(
    result: SyncOperationResult,
    retryAt: string,
  ): void {
    this.#outbox.applyResult(result, retryAt);
  }

  public recordFailure(errorCode: string): void {
    withImmediateTransaction(this.database, () => {
      this.database
        .prepare(`
          INSERT INTO sync_failures (operation_id, error_code, occurred_at)
          VALUES (NULL, ?, ?)
        `)
        .run(errorCode, new Date().toISOString());
      this.database.exec(`
        DELETE FROM sync_failures
        WHERE id NOT IN (
          SELECT id FROM sync_failures ORDER BY id DESC LIMIT 1000
        )
      `);
    });
  }

  public getEntity(
    entityType: SyncEntityType,
    entityId: string,
  ): LocalEntity | undefined {
    return this.#entities.get(entityType, entityId);
  }
  public hasPendingLocalChanges(
    entityTypes: readonly SyncEntityType[],
  ): boolean {
    if (entityTypes.length === 0) return false;
    const placeholders = entityTypes.map(() => "?").join(", ");
    const row = this.database.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM sync_entities
        WHERE entity_type IN (${placeholders}) AND sync_status <> 'clean'
      ) AS pending
    `).get(...entityTypes) as { pending: number };
    return row.pending === 1;
  }

  public listEntities(entityType: SyncEntityType): LocalEntity[] {
    return this.#entities.list(entityType);
  }

  public getSyncIssue(entityType: SyncEntityType, entityId: string): SyncIssue | undefined {
    return this.#recovery.get(entityType, entityId);
  }

  public acceptServer(entityType: SyncEntityType, entityId: string): void {
    this.#recovery.acceptServer(entityType, entityId);
  }

  public replaceBlocked(mutation: EnqueueMutation): void {
    this.#recovery.replaceBlocked(mutation);
  }

  public saveBlockedAsNew(
    sourceType: SyncEntityType,
    sourceId: string,
    mutation: EnqueueMutation,
  ): void {
    this.#recovery.saveBlockedAsNew(sourceType, sourceId, mutation);
  }

  public hasReminderDelivery(reminderId: string, remindAt: string): boolean {
    return this.#reminderDeliveries.has(reminderId, remindAt);
  }

  public recordReminderDelivery(
    reminderId: string,
    remindAt: string,
    deliveredAt: string,
  ): void {
    this.#reminderDeliveries.record(reminderId, remindAt, deliveredAt);
  }

  public retryPendingNow(): void {
    this.#outbox.retryPendingNow(new Date().toISOString());
  }

  public purgeLocal(): void {
    withImmediateTransaction(this.database, () => {
      this.database.exec(`
        DELETE FROM sync_entities;
        DELETE FROM local_outbox;
        DELETE FROM local_create_identities;
        DELETE FROM sync_conflicts;
        DELETE FROM sync_failures;
        DELETE FROM reminder_delivery_receipts;
        DELETE FROM sync_state;
      `);
      this.mergeLocalPayload?.clear?.();
    });
  }
}

function syncDirectory(apiBaseUrl: string, userId: string): string {
  return join(app.getPath("userData"), "sync", syncScopeKey(apiBaseUrl, userId));
}

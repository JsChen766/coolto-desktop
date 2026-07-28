import { createHash } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { app } from "electron";

import type {
  LocalSyncState,
  SyncEntityType,
  SyncOperationResult,
  SyncPage,
} from "../../../sync/types.js";
import { initializeLocalSyncSchema } from "./local-sync-schema.js";
import type {
  EnqueueMutation,
  LocalEntity,
  PendingOperation,
} from "./local-sync-types.js";
import { LocalOutboxStore } from "./local-outbox-store.js";
import {
  LocalCreateIdentityStore,
  type LocalCreateIdentity,
} from "./local-create-identity-store.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { RemotePageWriter } from "./remote-page-writer.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";
import { SyncKeyStore } from "./sync-key-store.js";

interface StateRow {
  mode: LocalSyncState["mode"];
  cursor: string;
}

interface EntityRow {
  entity_type: SyncEntityType;
  entity_id: string;
  entity_version: number;
  local_version: number;
  sync_status: LocalEntity["syncStatus"];
  operation: LocalEntity["operation"];
  changed_at: string;
  payload: Uint8Array;
}

export class LocalSyncStore {
  readonly #outbox: LocalOutboxStore;
  readonly #remote: RemotePageWriter;
  readonly #createIdentities: LocalCreateIdentityStore;

  private constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
  ) {
    this.#outbox = new LocalOutboxStore(database, codec);
    this.#remote = new RemotePageWriter(database, codec);
    this.#createIdentities = new LocalCreateIdentityStore(database);
  }

  public static async open(
    apiBaseUrl: string,
    userId: string,
  ): Promise<LocalSyncStore> {
    const directory = syncDirectory(apiBaseUrl, userId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const key = await new SyncKeyStore(directory).loadOrCreate();
    const databasePath = join(directory, "local-sync.sqlite");
    const database = new DatabaseSync(databasePath);
    try {
      await chmod(databasePath, 0o600);
      initializeLocalSyncSchema(database);
      return new LocalSyncStore(database, new SyncPayloadCodec(key));
    } catch (error: unknown) {
      database.close();
      throw error;
    }
  }

  public close(): void {
    this.database.close();
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
    const row = this.database
      .prepare(`
        SELECT entity_type, entity_id, entity_version, local_version,
               sync_status, operation, changed_at, payload
        FROM sync_entities
        WHERE entity_type = ? AND entity_id = ?
      `)
      .get(entityType, entityId) as EntityRow | undefined;
    if (!row) return undefined;
    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityVersion: row.entity_version,
      localVersion: row.local_version,
      syncStatus: row.sync_status,
      operation: row.operation,
      changedAt: row.changed_at,
      payload: this.codec.decode<Record<string, unknown>>(row.payload),
    };
  }

  public listEntities(entityType: SyncEntityType): LocalEntity[] {
	const rows = this.database
		.prepare(`
			SELECT entity_type, entity_id, entity_version, local_version,
			       sync_status, operation, changed_at, payload
			FROM sync_entities
			WHERE entity_type = ?
			ORDER BY changed_at DESC, entity_id
		`)
		.all(entityType) as unknown as EntityRow[];
	return rows.map((row) => ({
		entityType: row.entity_type,
		entityId: row.entity_id,
		entityVersion: row.entity_version,
		localVersion: row.local_version,
		syncStatus: row.sync_status,
		operation: row.operation,
		changedAt: row.changed_at,
		payload: this.codec.decode<Record<string, unknown>>(row.payload),
	}));
  }
}

function syncDirectory(apiBaseUrl: string, userId: string): string {
  const ownerHash = createHash("sha256")
    .update(apiBaseUrl.replace(/\/+$/, ""))
    .update("\0")
    .update(userId)
    .digest("hex")
    .slice(0, 24);
  return join(app.getPath("userData"), "sync", ownerHash);
}

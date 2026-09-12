import type { DatabaseSync } from "node:sqlite";

import type { LocalSyncState, SyncChange, SyncPage } from "../../../sync/types.js";
import type { LocalPayloadMerger } from "./local-sync-types.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";
import { assertProfileSyncPayload } from "../profile/profile-local-sync-adapter.js";

interface EntityStateRow {
  entity_version: number;
  sync_status: "clean" | "pending" | "conflict" | "failed";
  payload: Uint8Array;
}

interface OperationRow {
  operation_id: string;
  payload: Uint8Array;
}

export class RemotePageWriter {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
    private readonly mergeLocalPayload?: LocalPayloadMerger,
  ) {}

  public resetForBootstrap(): void {
    withImmediateTransaction(this.database, () => {
      this.database.exec("DELETE FROM sync_entities WHERE sync_status = 'clean'");
      this.database.exec("DELETE FROM sync_state");
    });
  }

  public apply(page: SyncPage, nextMode: LocalSyncState["mode"]): void {
    withImmediateTransaction(this.database, () => {
      for (const change of page.changes) this.#applyChange(change);
      this.database
        .prepare(`
          INSERT INTO sync_state (singleton, mode, cursor, updated_at)
          VALUES (1, ?, ?, ?)
          ON CONFLICT (singleton) DO UPDATE SET
            mode = excluded.mode,
            cursor = excluded.cursor,
            updated_at = excluded.updated_at
        `)
        .run(nextMode, page.nextCursor, page.serverTime);
    });
  }

  #applyChange(change: SyncChange): void {
    if (change.operation === "upsert") {
      // This runs inside the page transaction, before entity or cursor writes.
      // A semantic contract error must roll back the whole page.
      assertProfileSyncPayload(change.entityType, change.payload);
    }
    const current = this.database
      .prepare(`
        SELECT entity_version, sync_status, payload
        FROM sync_entities
        WHERE entity_type = ? AND entity_id = ?
      `)
      .get(change.entityType, change.entityId) as EntityStateRow | undefined;
    if (current && change.entityVersion < current.entity_version) return;
    if (current?.sync_status !== undefined && current.sync_status !== "clean") {
      if (change.entityVersion > current.entity_version) {
        this.#recordConflict(change);
      }
      return;
    }
    const currentPayload = current
      ? this.codec.decode<Record<string, unknown>>(current.payload) : undefined;
    const localPayload = this.mergeLocalPayload?.(
      change.entityType, currentPayload, change.payload,
    ) ?? change.payload;
    this.database
      .prepare(`
        INSERT INTO sync_entities (
          entity_type, entity_id, entity_version, local_version,
          sync_status, operation, changed_at, payload,
          last_server_operation, last_server_payload, last_error_code
        ) VALUES (?, ?, ?, 1, 'clean', ?, ?, ?, ?, ?, NULL)
        ON CONFLICT (entity_type, entity_id) DO UPDATE SET
          entity_version = excluded.entity_version,
          sync_status = 'clean',
          operation = excluded.operation,
          changed_at = excluded.changed_at,
          payload = excluded.payload,
          last_server_operation = excluded.last_server_operation,
          last_server_payload = excluded.last_server_payload,
          last_error_code = NULL
      `)
      .run(
        change.entityType, change.entityId, change.entityVersion,
        change.operation, change.changedAt, this.codec.encode(localPayload),
        change.operation, this.codec.encode(change.payload),
      );
  }

  #recordConflict(change: SyncChange): void {
    const operation = this.database
      .prepare(`
        SELECT operation_id, payload
        FROM local_outbox
        WHERE entity_type = ? AND entity_id = ?
          AND status IN ('pending', 'conflict', 'failed')
        ORDER BY created_at
        LIMIT 1
      `)
      .get(change.entityType, change.entityId) as OperationRow | undefined;
    if (!operation) return;
    const now = new Date().toISOString();
    this.database
      .prepare(`
        INSERT INTO sync_conflicts (
          operation_id, entity_type, entity_id, local_payload,
          server_payload, server_operation, server_version, error_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'entity_version_conflict', ?)
        ON CONFLICT (operation_id) DO UPDATE SET
          server_payload = excluded.server_payload,
          server_operation = excluded.server_operation,
          server_version = excluded.server_version,
          error_code = excluded.error_code
      `)
      .run(
        operation.operation_id,
        change.entityType,
        change.entityId,
        operation.payload,
        this.codec.encode(change.payload),
        change.operation,
        change.entityVersion,
        now,
      );
    this.database.prepare(`
      UPDATE local_outbox SET status = 'conflict',
        last_error_code = 'entity_version_conflict' WHERE operation_id = ?
    `).run(operation.operation_id);
    this.database
      .prepare(`
        UPDATE sync_entities SET sync_status = 'conflict',
          entity_version = ?, last_server_operation = ?,
          last_server_payload = ?, last_error_code = 'entity_version_conflict'
        WHERE entity_type = ? AND entity_id = ?
      `)
      .run(
        change.entityVersion,
        change.operation,
        this.codec.encode(change.payload),
        change.entityType,
        change.entityId,
      );
  }
}

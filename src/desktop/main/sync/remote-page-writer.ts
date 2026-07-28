import type { DatabaseSync } from "node:sqlite";

import type {
  LocalSyncState,
  SyncChange,
  SyncPage,
} from "../../../sync/types.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";

interface EntityStateRow {
  entity_version: number;
  sync_status: "clean" | "pending" | "conflict";
}

interface OperationRow {
  operation_id: string;
  payload: Uint8Array;
}

export class RemotePageWriter {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
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
    const current = this.database
      .prepare(`
        SELECT entity_version, sync_status
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

    this.database
      .prepare(`
        INSERT INTO sync_entities (
          entity_type, entity_id, entity_version, local_version,
          sync_status, operation, changed_at, payload
        ) VALUES (?, ?, ?, 1, 'clean', ?, ?, ?)
        ON CONFLICT (entity_type, entity_id) DO UPDATE SET
          entity_version = excluded.entity_version,
          sync_status = 'clean',
          operation = excluded.operation,
          changed_at = excluded.changed_at,
          payload = excluded.payload
      `)
      .run(
        change.entityType,
        change.entityId,
        change.entityVersion,
        change.operation,
        change.changedAt,
        this.codec.encode(change.payload),
      );
  }

  #recordConflict(change: SyncChange): void {
    const operation = this.database
      .prepare(`
        SELECT operation_id, payload
        FROM local_outbox
        WHERE entity_type = ? AND entity_id = ?
          AND status IN ('pending', 'conflict')
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
          server_payload, server_version, error_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'entity_version_conflict', ?)
        ON CONFLICT (operation_id) DO UPDATE SET
          server_payload = excluded.server_payload,
          server_version = excluded.server_version,
          error_code = excluded.error_code
      `)
      .run(
        operation.operation_id,
        change.entityType,
        change.entityId,
        operation.payload,
        this.codec.encode(change.payload),
        change.entityVersion,
        now,
      );
    this.database
      .prepare("UPDATE local_outbox SET status = 'conflict' WHERE operation_id = ?")
      .run(operation.operation_id);
    this.database
      .prepare(`
        UPDATE sync_entities SET sync_status = 'conflict'
        WHERE entity_type = ? AND entity_id = ?
      `)
      .run(change.entityType, change.entityId);
  }
}

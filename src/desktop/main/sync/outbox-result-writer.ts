import type { DatabaseSync } from "node:sqlite";

import type { SyncOperationResult } from "../../../sync/types.js";
import type { OutboxRow } from "./local-sync-types.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";

export class OutboxResultWriter {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
  ) {}

  public apply(result: SyncOperationResult, retryAt: string): void {
    withImmediateTransaction(this.database, () => {
      const row = this.#find(result.operationId);
      if (!row) return;
      if (result.status === "retryable_error") {
        this.#retry(result, retryAt);
      } else if (result.status === "applied" || result.status === "already_applied") {
        this.#applied(row, result);
      } else {
        this.#terminal(row, result);
      }
    });
  }

  #applied(row: OutboxRow, result: SyncOperationResult): void {
    if (result.appliedVersion === null) throw new Error("同步成功结果缺少 entityVersion");
    this.database.prepare("DELETE FROM local_outbox WHERE operation_id = ?")
      .run(row.operation_id);
    this.database.prepare(`
      UPDATE local_outbox SET expected_version = ?
      WHERE entity_type = ? AND entity_id = ? AND status = 'pending'
    `).run(result.appliedVersion, row.entity_type, row.entity_id);
    const pending = this.#pendingCount(row);
    const serverPayload = result.serverEntity
      ? this.codec.encode(result.serverEntity)
      : row.action === "delete" ? this.codec.encode({}) : null;
    const serverOperation = row.action === "delete" ? "delete" : "upsert";
    this.database.prepare(`
      UPDATE sync_entities SET
        entity_version = ?, sync_status = ?, last_error_code = NULL,
        payload = CASE WHEN ? = 0 THEN COALESCE(?, payload) ELSE payload END,
        last_server_operation = ?,
        last_server_payload = CASE
          WHEN ? IS NOT NULL THEN ?
          WHEN ? = 0 THEN payload
          ELSE last_server_payload
        END
      WHERE entity_type = ? AND entity_id = ?
    `).run(
      result.appliedVersion, pending > 0 ? "pending" : "clean", pending, serverPayload,
      serverOperation, serverPayload, serverPayload, pending,
      row.entity_type, row.entity_id,
    );
  }

  #retry(result: SyncOperationResult, retryAt: string): void {
    const error = result.errorCode ?? "sync_retryable_error";
    this.database.prepare(`
      UPDATE local_outbox SET attempt_count = attempt_count + 1,
        next_attempt_at = ?, last_error_code = ? WHERE operation_id = ?
    `).run(retryAt, error, result.operationId);
    this.database.prepare(`
      UPDATE sync_entities SET last_error_code = ?
      WHERE entity_type = (SELECT entity_type FROM local_outbox WHERE operation_id = ?)
        AND entity_id = (SELECT entity_id FROM local_outbox WHERE operation_id = ?)
    `).run(error, result.operationId, result.operationId);
  }

  #terminal(row: OutboxRow, result: SyncOperationResult): void {
    const status = result.status === "conflict" ? "conflict" : "failed";
    const error = result.errorCode ?? `sync_${result.status}`;
    const hasServer = result.appliedVersion !== null;
    const serverOperation = hasServer
      ? result.serverEntity ? "upsert" : "delete"
      : null;
    const serverPayload = hasServer
      ? this.codec.encode(result.serverEntity ?? {})
      : null;
    this.database.prepare(`
      UPDATE local_outbox SET status = ?, last_error_code = ? WHERE operation_id = ?
    `).run(status, error, row.operation_id);
    this.database.prepare(`
      UPDATE sync_entities SET sync_status = ?, last_error_code = ?,
        entity_version = COALESCE(?, entity_version),
        last_server_operation = COALESCE(?, last_server_operation),
        last_server_payload = COALESCE(?, last_server_payload)
      WHERE entity_type = ? AND entity_id = ?
    `).run(
      status, error, result.appliedVersion, serverOperation, serverPayload,
      row.entity_type, row.entity_id,
    );
    if (status === "conflict") this.#recordConflict(row, result, error, serverOperation);
  }

  #recordConflict(
    row: OutboxRow,
    result: SyncOperationResult,
    error: string,
    serverOperation: "upsert" | "delete" | null,
  ): void {
    this.database.prepare(`
      INSERT INTO sync_conflicts (
        operation_id, entity_type, entity_id, local_payload, server_payload,
        server_operation, server_version, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (operation_id) DO UPDATE SET
        server_payload = excluded.server_payload,
        server_operation = excluded.server_operation,
        server_version = excluded.server_version, error_code = excluded.error_code
    `).run(
      row.operation_id, row.entity_type, row.entity_id, row.payload,
      result.serverEntity ? this.codec.encode(result.serverEntity) : null,
      serverOperation, result.appliedVersion, error, new Date().toISOString(),
    );
  }

  #pendingCount(row: OutboxRow): number {
    const result = this.database.prepare(`
      SELECT COUNT(*) AS count FROM local_outbox
      WHERE entity_type = ? AND entity_id = ? AND status = 'pending'
    `).get(row.entity_type, row.entity_id) as { count: number };
    return result.count;
  }

  #find(operationId: string): OutboxRow | undefined {
    return this.database.prepare(`
      SELECT operation_id, entity_type, entity_id, action, expected_version,
        payload, created_at, attempt_count, next_attempt_at
      FROM local_outbox WHERE operation_id = ?
    `).get(operationId) as OutboxRow | undefined;
  }
}

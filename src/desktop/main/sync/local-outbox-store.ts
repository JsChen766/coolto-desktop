import type { DatabaseSync } from "node:sqlite";

import type { SyncOperationResult } from "../../../sync/types.js";
import { canonicalJson } from "./canonical-json.js";
import type {
  EnqueueMutation,
  OutboxRow,
  PendingOperation,
} from "./local-sync-types.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";

export class LocalOutboxStore {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
  ) {}

  public enqueue(mutation: EnqueueMutation): string {
    return withImmediateTransaction(this.database, () => {
      const existing = this.#find(mutation.operationId);
      if (existing) {
        this.#assertSame(existing, mutation);
        return existing.operation_id;
      }
      const createdAt = mutation.createdAt ?? new Date().toISOString();
      this.database
        .prepare(`
          INSERT INTO local_outbox (
            operation_id, entity_type, entity_id, action, expected_version,
            payload, status, created_at, next_attempt_at
          ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
        `)
        .run(
          mutation.operationId,
          mutation.entityType,
          mutation.entityId,
          mutation.action,
          mutation.expectedVersion,
          this.codec.encode(mutation.payload),
          createdAt,
          createdAt,
        );
      this.database
        .prepare(`
          INSERT INTO sync_entities (
            entity_type, entity_id, entity_version, local_version,
            sync_status, operation, changed_at, payload
          ) VALUES (?, ?, ?, 1, 'pending', ?, ?, ?)
          ON CONFLICT (entity_type, entity_id) DO UPDATE SET
            local_version = sync_entities.local_version + 1,
            sync_status = 'pending',
            operation = excluded.operation,
            changed_at = excluded.changed_at,
            payload = excluded.payload
        `)
        .run(
          mutation.entityType,
          mutation.entityId,
          mutation.expectedVersion ?? 0,
          mutation.action === "delete" ? "delete" : "upsert",
          createdAt,
		  this.codec.encode(mutation.localPayload ?? mutation.payload),
        );
      return mutation.operationId;
    });
  }

  public listReady(now: string, limit: number): PendingOperation[] {
    const rows = this.database
      .prepare(`
        SELECT operation_id, entity_type, entity_id, action, expected_version,
               payload, created_at, attempt_count, next_attempt_at
        FROM local_outbox
        WHERE status = 'pending' AND next_attempt_at <= ?
          AND NOT EXISTS (
            SELECT 1
            FROM local_outbox AS blocked
            WHERE blocked.entity_type = local_outbox.entity_type
              AND blocked.entity_id = local_outbox.entity_id
              AND blocked.status IN ('conflict', 'failed')
          )
        ORDER BY created_at, operation_id
        LIMIT ?
      `)
      .all(now, limit) as unknown as OutboxRow[];
    const seen = new Set<string>();
    return rows.flatMap((row) => {
      const entityKey = `${row.entity_type}\0${row.entity_id}`;
      if (seen.has(entityKey)) return [];
      seen.add(entityKey);
      return [{
        operationId: row.operation_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        expectedVersion: row.expected_version,
        payload: this.codec.decode<Record<string, unknown>>(row.payload),
        attemptCount: row.attempt_count,
        createdAt: row.created_at,
        nextAttemptAt: row.next_attempt_at,
      }];
    });
  }

  public applyResult(
    result: SyncOperationResult,
    retryAt: string,
  ): void {
    withImmediateTransaction(this.database, () => {
      const row = this.#find(result.operationId);
      if (!row) return;
      if (result.status === "retryable_error") {
        this.#scheduleRetry(result, retryAt);
        return;
      }
      if (result.status === "applied" || result.status === "already_applied") {
        this.#markApplied(row, result);
        return;
      }
      this.#markTerminal(row, result);
    });
  }

  #markApplied(row: OutboxRow, result: SyncOperationResult): void {
    if (result.appliedVersion === null) {
      throw new Error("同步成功结果缺少 entityVersion");
    }
    this.database
      .prepare("DELETE FROM local_outbox WHERE operation_id = ?")
      .run(row.operation_id);
    this.database
      .prepare(`
        UPDATE local_outbox SET expected_version = ?
        WHERE entity_type = ? AND entity_id = ? AND status = 'pending'
      `)
      .run(result.appliedVersion, row.entity_type, row.entity_id);
    const pending = this.database
      .prepare(`
        SELECT COUNT(*) AS count FROM local_outbox
        WHERE entity_type = ? AND entity_id = ? AND status = 'pending'
      `)
      .get(row.entity_type, row.entity_id) as { count: number };
    const serverPayload = result.serverEntity
      ? this.codec.encode(result.serverEntity)
      : undefined;
    this.database
      .prepare(`
        UPDATE sync_entities SET
          entity_version = ?,
          sync_status = ?,
          payload = COALESCE(?, payload)
        WHERE entity_type = ? AND entity_id = ?
      `)
      .run(
        result.appliedVersion,
        pending.count > 0 ? "pending" : "clean",
        pending.count > 0 ? null : serverPayload ?? null,
        row.entity_type,
        row.entity_id,
      );
  }

  #scheduleRetry(result: SyncOperationResult, retryAt: string): void {
    this.database
      .prepare(`
        UPDATE local_outbox SET
          attempt_count = attempt_count + 1,
          next_attempt_at = ?,
          last_error_code = ?
        WHERE operation_id = ?
      `)
      .run(retryAt, result.errorCode ?? "sync_retryable_error", result.operationId);
  }

  #markTerminal(row: OutboxRow, result: SyncOperationResult): void {
    const status = result.status === "conflict" ? "conflict" : "failed";
    const errorCode = result.errorCode ?? `sync_${result.status}`;
    this.database
      .prepare(`
        UPDATE local_outbox SET status = ?, last_error_code = ?
        WHERE operation_id = ?
      `)
      .run(status, errorCode, row.operation_id);
    this.database
      .prepare(`
        UPDATE sync_entities SET sync_status = 'conflict'
        WHERE entity_type = ? AND entity_id = ?
      `)
      .run(row.entity_type, row.entity_id);
    this.database
      .prepare(`
        INSERT INTO sync_conflicts (
          operation_id, entity_type, entity_id, local_payload,
          server_payload, server_version, error_code, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (operation_id) DO UPDATE SET
          server_payload = excluded.server_payload,
          server_version = excluded.server_version,
          error_code = excluded.error_code
      `)
      .run(
        row.operation_id,
        row.entity_type,
        row.entity_id,
        row.payload,
        result.serverEntity ? this.codec.encode(result.serverEntity) : null,
        result.appliedVersion,
        errorCode,
        new Date().toISOString(),
      );
  }

  #find(operationId: string): OutboxRow | undefined {
    return this.database
      .prepare(`
        SELECT operation_id, entity_type, entity_id, action, expected_version,
               payload, created_at, attempt_count, next_attempt_at
        FROM local_outbox WHERE operation_id = ?
      `)
      .get(operationId) as OutboxRow | undefined;
  }

  #assertSame(row: OutboxRow, mutation: EnqueueMutation): void {
    const payload = this.codec.decode<Record<string, unknown>>(row.payload);
    if (
      row.entity_type !== mutation.entityType ||
      row.entity_id !== mutation.entityId ||
      row.action !== mutation.action ||
      row.expected_version !== mutation.expectedVersion ||
      canonicalJson(payload) !== canonicalJson(mutation.payload)
    ) {
      throw new Error("operationId 已被另一条本地同步操作使用");
    }
  }
}

import type { DatabaseSync } from "node:sqlite";

import { canonicalJson } from "./canonical-json.js";
import type {
  EnqueueMutation,
  OutboxRow,
  PendingOperation,
} from "./local-sync-types.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { OutboxResultWriter } from "./outbox-result-writer.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";

export class LocalOutboxStore {
  readonly #results: OutboxResultWriter;

  public constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
  ) {
    this.#results = new OutboxResultWriter(database, codec);
  }

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
            last_error_code = NULL,
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

  public applyResult(result: import("../../../sync/types.js").SyncOperationResult, retryAt: string): void {
    this.#results.apply(result, retryAt);
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

import type { DatabaseSync } from "node:sqlite";

import type { SyncEntityType } from "../../../sync/types.js";
import type { EnqueueMutation, SyncIssue } from "./local-sync-types.js";
import { SyncPayloadCodec } from "./payload-codec.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";

interface IssueRow {
  entity_version: number;
  sync_status: "conflict" | "failed";
  payload: Uint8Array;
  last_server_operation: "upsert" | "delete" | null;
  last_server_payload: Uint8Array | null;
  last_error_code: string | null;
  action: EnqueueMutation["action"];
  outbox_error: string | null;
}

export class SyncRecoveryStore {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
  ) {}

  public get(entityType: SyncEntityType, entityId: string): SyncIssue | undefined {
    const row = this.#row(entityType, entityId);
    if (!row) return undefined;
    return {
      entityType,
      entityId,
      status: row.sync_status,
      action: row.action,
      serverVersion: row.entity_version,
      serverOperation: row.last_server_operation,
      localPayload: this.codec.decode<Record<string, unknown>>(row.payload),
      serverPayload: row.last_server_payload
        ? this.codec.decode<Record<string, unknown>>(row.last_server_payload)
        : null,
      errorCode: row.outbox_error ?? row.last_error_code ?? "sync_failed",
    };
  }

  public acceptServer(entityType: SyncEntityType, entityId: string): void {
    withImmediateTransaction(this.database, () => {
      const row = this.#required(entityType, entityId);
      this.#resolve(entityType, entityId, row);
    });
  }

  public replaceBlocked(mutation: EnqueueMutation): void {
    withImmediateTransaction(this.database, () => {
      this.#required(mutation.entityType, mutation.entityId);
      this.#clear(mutation.entityType, mutation.entityId);
      this.#enqueue(mutation);
    });
  }

  public saveBlockedAsNew(
    sourceType: SyncEntityType,
    sourceId: string,
    mutation: EnqueueMutation,
  ): void {
    withImmediateTransaction(this.database, () => {
      const row = this.#required(sourceType, sourceId);
      this.#resolve(sourceType, sourceId, row);
      this.#enqueue(mutation);
    });
  }

  #resolve(entityType: SyncEntityType, entityId: string, row: IssueRow): void {
    this.#clear(entityType, entityId);
    if (row.last_server_operation === null) {
      if (row.action !== "create") throw new Error("最新服务端版本尚未拉取");
      this.database.prepare(`
        DELETE FROM sync_entities WHERE entity_type = ? AND entity_id = ?
      `).run(entityType, entityId);
      return;
    }
    this.database.prepare(`
      UPDATE sync_entities SET local_version = local_version + 1,
        sync_status = 'clean', operation = last_server_operation,
        payload = last_server_payload, last_error_code = NULL
      WHERE entity_type = ? AND entity_id = ?
    `).run(entityType, entityId);
  }

  #enqueue(mutation: EnqueueMutation): void {
    const createdAt = mutation.createdAt ?? new Date().toISOString();
    this.database.prepare(`
      INSERT INTO local_outbox (
        operation_id, entity_type, entity_id, action, expected_version,
        payload, status, created_at, next_attempt_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      mutation.operationId, mutation.entityType, mutation.entityId, mutation.action,
      mutation.expectedVersion, this.codec.encode(mutation.payload), createdAt, createdAt,
    );
    this.database.prepare(`
      INSERT INTO sync_entities (
        entity_type, entity_id, entity_version, local_version, sync_status,
        operation, changed_at, payload
      ) VALUES (?, ?, ?, 1, 'pending', ?, ?, ?)
      ON CONFLICT (entity_type, entity_id) DO UPDATE SET
        local_version = sync_entities.local_version + 1, sync_status = 'pending',
        operation = excluded.operation, changed_at = excluded.changed_at,
        payload = excluded.payload, last_error_code = NULL
    `).run(
      mutation.entityType, mutation.entityId, mutation.expectedVersion ?? 0,
      mutation.action === "delete" ? "delete" : "upsert", createdAt,
      this.codec.encode(mutation.localPayload ?? mutation.payload),
    );
  }

  #clear(entityType: SyncEntityType, entityId: string): void {
    this.database.prepare(`
      DELETE FROM sync_conflicts WHERE entity_type = ? AND entity_id = ?
    `).run(entityType, entityId);
    this.database.prepare(`
      DELETE FROM local_outbox WHERE entity_type = ? AND entity_id = ?
    `).run(entityType, entityId);
  }

  #required(entityType: SyncEntityType, entityId: string): IssueRow {
    const row = this.#row(entityType, entityId);
    if (!row) throw new Error("同步问题不存在或已经解决");
    return row;
  }

  #row(entityType: SyncEntityType, entityId: string): IssueRow | undefined {
    return this.database.prepare(`
      SELECT e.entity_version, e.sync_status, e.payload,
        e.last_server_operation, e.last_server_payload, e.last_error_code,
        o.action, o.last_error_code AS outbox_error
      FROM sync_entities e JOIN local_outbox o
        ON o.entity_type = e.entity_type AND o.entity_id = e.entity_id
      WHERE e.entity_type = ? AND e.entity_id = ?
        AND e.sync_status IN ('conflict', 'failed')
        AND o.status IN ('conflict', 'failed')
      ORDER BY o.created_at, o.operation_id LIMIT 1
    `).get(entityType, entityId) as IssueRow | undefined;
  }
}

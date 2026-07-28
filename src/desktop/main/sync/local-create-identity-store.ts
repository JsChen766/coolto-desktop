import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { SyncEntityType } from "../../../sync/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import { canonicalJson } from "./canonical-json.js";
import { withImmediateTransaction } from "./sqlite-transaction.js";

export interface LocalCreateIdentity {
  entityId: string;
  operationId: string;
}

interface IdentityRow {
  entity_id: string;
  operation_id: string;
  request_hash: string;
}

export class LocalCreateIdentityStore {
  public constructor(private readonly database: DatabaseSync) {}

  public resolve(
    entityType: SyncEntityType,
    idempotencyKey: string,
    request: unknown,
  ): LocalCreateIdentity {
    const key = idempotencyKey.trim();
    if (!key || key.length > 512) {
      throw new Error("idempotencyKey 必须为 1–512 个字符");
    }
    const requestHash = hashRequest(request);
    return withImmediateTransaction(this.database, () => {
      const existing = this.#find(entityType, key);
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new Error("idempotencyKey 已被另一条创建请求使用");
        }
        return {
          entityId: existing.entity_id,
          operationId: existing.operation_id,
        };
      }
      const identity = {
        entityId: createUuidV7(),
        operationId: createUuidV7(),
      };
      this.database
        .prepare(`
          INSERT INTO local_create_identities (
            entity_type, idempotency_key, entity_id, operation_id,
            request_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        .run(
          entityType,
          key,
          identity.entityId,
          identity.operationId,
          requestHash,
          new Date().toISOString(),
        );
      return identity;
    });
  }

  #find(entityType: SyncEntityType, key: string): IdentityRow | undefined {
    return this.database
      .prepare(`
        SELECT entity_id, operation_id, request_hash
        FROM local_create_identities
        WHERE entity_type = ? AND idempotency_key = ?
      `)
      .get(entityType, key) as IdentityRow | undefined;
  }
}

function hashRequest(request: unknown): string {
  return createHash("sha256").update(canonicalJson(request)).digest("hex");
}

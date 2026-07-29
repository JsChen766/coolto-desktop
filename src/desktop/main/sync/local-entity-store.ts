import type { DatabaseSync } from "node:sqlite";

import type { SyncEntityType } from "../../../sync/types.js";
import type { LocalEntity } from "./local-sync-types.js";
import { SyncPayloadCodec } from "./payload-codec.js";

interface EntityRow {
  entity_type: SyncEntityType;
  entity_id: string;
  entity_version: number;
  local_version: number;
  sync_status: LocalEntity["syncStatus"];
  operation: LocalEntity["operation"];
  changed_at: string;
  payload: Uint8Array;
  last_server_operation: LocalEntity["lastServerOperation"];
  last_server_payload: Uint8Array | null;
  last_error_code: string | null;
}

const columns = `
  entity_type, entity_id, entity_version, local_version, sync_status,
  operation, changed_at, payload, last_server_operation,
  last_server_payload, last_error_code
`;

export class LocalEntityStore {
  public constructor(
    private readonly database: DatabaseSync,
    private readonly codec: SyncPayloadCodec,
  ) {}

  public get(entityType: SyncEntityType, entityId: string): LocalEntity | undefined {
    const row = this.database.prepare(`
      SELECT ${columns} FROM sync_entities
      WHERE entity_type = ? AND entity_id = ?
    `).get(entityType, entityId) as EntityRow | undefined;
    return row ? this.#map(row) : undefined;
  }

  public list(entityType: SyncEntityType): LocalEntity[] {
    const rows = this.database.prepare(`
      SELECT ${columns} FROM sync_entities
      WHERE entity_type = ? ORDER BY changed_at DESC, entity_id
    `).all(entityType) as unknown as EntityRow[];
    return rows.map((row) => this.#map(row));
  }

  #map(row: EntityRow): LocalEntity {
    return {
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityVersion: row.entity_version,
      localVersion: row.local_version,
      syncStatus: row.sync_status,
      operation: row.operation,
      changedAt: row.changed_at,
      payload: this.codec.decode<Record<string, unknown>>(row.payload),
      lastServerOperation: row.last_server_operation ?? null,
      lastServerPayload: row.last_server_payload
        ? this.codec.decode<Record<string, unknown>>(row.last_server_payload)
        : null,
      lastErrorCode: row.last_error_code,
    };
  }
}

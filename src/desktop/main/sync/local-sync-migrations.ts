import type { DatabaseSync } from "node:sqlite";

import { withImmediateTransaction } from "./sqlite-transaction.js";

interface SchemaRow {
  sql: string;
}

interface ColumnRow {
  name: string;
}

export function migrateLocalSyncSchema(database: DatabaseSync): void {
  migrateSyncEntities(database);
  addColumn(database, "sync_conflicts", "server_operation", `
    ALTER TABLE sync_conflicts ADD COLUMN server_operation TEXT
      CHECK (server_operation IS NULL OR server_operation IN ('upsert', 'delete'))
  `);
}

function migrateSyncEntities(database: DatabaseSync): void {
  const row = database
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sync_entities'")
    .get() as SchemaRow | undefined;
  if (!row || row.sql.includes("'failed'")) return;
  withImmediateTransaction(database, () => {
    database.exec("ALTER TABLE sync_entities RENAME TO sync_entities_legacy");
    database.exec(`
      CREATE TABLE sync_entities (
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        entity_version INTEGER NOT NULL CHECK (entity_version >= 0),
        local_version INTEGER NOT NULL DEFAULT 1 CHECK (local_version >= 1),
        sync_status TEXT NOT NULL DEFAULT 'clean'
          CHECK (sync_status IN ('clean', 'pending', 'conflict', 'failed')),
        operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
        changed_at TEXT NOT NULL,
        payload BLOB NOT NULL,
        last_server_operation TEXT
          CHECK (last_server_operation IS NULL OR last_server_operation IN ('upsert', 'delete')),
        last_server_payload BLOB,
        last_error_code TEXT,
        PRIMARY KEY (entity_type, entity_id)
      ) STRICT
    `);
    database.exec(`
      INSERT INTO sync_entities (
        entity_type, entity_id, entity_version, local_version, sync_status,
        operation, changed_at, payload, last_server_operation, last_server_payload
      )
      SELECT entity_type, entity_id, entity_version, local_version, sync_status,
        operation, changed_at, payload,
        CASE WHEN sync_status = 'clean' THEN operation ELSE NULL END,
        CASE WHEN sync_status = 'clean' THEN payload ELSE NULL END
      FROM sync_entities_legacy
    `);
    database.exec("DROP TABLE sync_entities_legacy");
  });
}

function addColumn(
  database: DatabaseSync,
  table: string,
  column: string,
  sql: string,
): void {
  const columns = database
    .prepare(`PRAGMA table_info(${table})`)
    .all() as unknown as ColumnRow[];
  if (!columns.some((item) => item.name === column)) database.exec(sql);
}

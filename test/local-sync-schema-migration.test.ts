import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";

test("local sync schema upgrades legacy entity status and recovery columns", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE sync_entities (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      entity_version INTEGER NOT NULL,
      local_version INTEGER NOT NULL,
      sync_status TEXT NOT NULL CHECK (sync_status IN ('clean', 'pending', 'conflict')),
      operation TEXT NOT NULL,
      changed_at TEXT NOT NULL,
      payload BLOB NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    ) STRICT;
    INSERT INTO sync_entities VALUES (
      'experience', 'exp-1', 1, 1, 'clean', 'upsert',
      '2026-07-29T00:00:00Z', x'01'
    );
    CREATE TABLE sync_conflicts (
      operation_id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_payload BLOB NOT NULL,
      server_payload BLOB,
      server_version INTEGER,
      error_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;
  `);

  initializeLocalSyncSchema(database);
  const entityColumns = database.prepare("PRAGMA table_info(sync_entities)")
    .all() as unknown as Array<{ name: string }>;
  const conflictColumns = database.prepare("PRAGMA table_info(sync_conflicts)")
    .all() as unknown as Array<{ name: string }>;
  assert.ok(entityColumns.some((column) => column.name === "last_server_payload"));
  assert.ok(entityColumns.some((column) => column.name === "last_error_code"));
  assert.ok(conflictColumns.some((column) => column.name === "server_operation"));
  database.prepare(`
    UPDATE sync_entities SET sync_status = 'failed' WHERE entity_id = 'exp-1'
  `).run();
  const row = database.prepare(`
    SELECT last_server_operation, last_server_payload
    FROM sync_entities WHERE entity_id = 'exp-1'
  `).get() as { last_server_operation: string; last_server_payload: Uint8Array };
  assert.equal(row.last_server_operation, "upsert");
  assert.deepEqual([...row.last_server_payload], [1]);
  database.close();
});

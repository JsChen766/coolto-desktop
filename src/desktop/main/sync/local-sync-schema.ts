import type { DatabaseSync } from "node:sqlite";
import { migrateLocalSyncSchema } from "./local-sync-migrations.js";

export const SYNC_ENTITIES_TABLE_SQL = `
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
  ) STRICT`;

export function initializeLocalSyncSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;

    ${SYNC_ENTITIES_TABLE_SQL.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")};

    CREATE TABLE IF NOT EXISTS local_outbox (
      operation_id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'transition')),
      expected_version INTEGER,
      payload BLOB NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'conflict', 'failed')),
      created_at TEXT NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at TEXT NOT NULL,
      last_error_code TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS local_outbox_ready_idx
      ON local_outbox (status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS local_outbox_entity_idx
      ON local_outbox (entity_type, entity_id, status);

    CREATE TABLE IF NOT EXISTS local_create_identities (
      entity_type TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      operation_id TEXT NOT NULL UNIQUE,
      request_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, idempotency_key),
      UNIQUE (entity_type, entity_id)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sync_state (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      mode TEXT NOT NULL CHECK (mode IN ('bootstrap', 'pull')),
      cursor TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sync_conflicts (
      operation_id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      local_payload BLOB NOT NULL,
      server_payload BLOB,
      server_operation TEXT
        CHECK (server_operation IS NULL OR server_operation IN ('upsert', 'delete')),
      server_version INTEGER,
      error_code TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sync_failures (
      id INTEGER PRIMARY KEY,
      operation_id TEXT,
      error_code TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS reminder_delivery_receipts (
      reminder_id TEXT NOT NULL,
      remind_at TEXT NOT NULL,
      delivered_at TEXT NOT NULL,
      PRIMARY KEY (reminder_id, remind_at)
    ) STRICT;
  `);
  migrateLocalSyncSchema(database);
}

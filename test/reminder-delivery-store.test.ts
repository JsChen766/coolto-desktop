import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";
import { ReminderDeliveryStore } from "../src/desktop/main/sync/reminder-delivery-store.js";

test("提醒送达凭据按 reminder/remindAt 去重并允许重新安排", () => {
  const database = new DatabaseSync(":memory:");
  initializeLocalSyncSchema(database);
  const store = new ReminderDeliveryStore(database);
  store.record("r", "2026-07-29T10:00:00.000Z", "2026-07-29T10:00:01.000Z");
  store.record("r", "2026-07-29T10:00:00.000Z", "2026-07-29T10:00:02.000Z");
  assert.equal(store.has("r", "2026-07-29T10:00:00.000Z"), true);
  store.record("r", "2026-07-30T10:00:00.000Z", "2026-07-30T10:00:00.000Z");
  assert.equal(store.has("r", "2026-07-29T10:00:00.000Z"), false);
  assert.equal(store.has("r", "2026-07-30T10:00:00.000Z"), true);
  database.close();
});

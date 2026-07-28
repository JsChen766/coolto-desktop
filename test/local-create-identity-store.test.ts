import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { LocalCreateIdentityStore } from "../src/desktop/main/sync/local-create-identity-store.js";
import { initializeLocalSyncSchema } from "../src/desktop/main/sync/local-sync-schema.js";

test("local create identity reuses ids for the same business request", () => {
  const database = new DatabaseSync(":memory:");
  initializeLocalSyncSchema(database);
  const identities = new LocalCreateIdentityStore(database);

  const first = identities.resolve("experience", "import-1:candidate-1", {
    title: "Engineer",
  });
  const replay = identities.resolve("experience", "import-1:candidate-1", {
    title: "Engineer",
  });

  assert.deepEqual(replay, first);
  assert.match(first.entityId, /^[0-9a-f-]{36}$/u);
  assert.match(first.operationId, /^[0-9a-f-]{36}$/u);
  database.close();
});

test("local create identity rejects key reuse with another request", () => {
  const database = new DatabaseSync(":memory:");
  initializeLocalSyncSchema(database);
  const identities = new LocalCreateIdentityStore(database);
  identities.resolve("job_description", "stable-key", { title: "A" });

  assert.throws(
    () => identities.resolve("job_description", "stable-key", { title: "B" }),
    /已被另一条创建请求使用/u,
  );
  database.close();
});

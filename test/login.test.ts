import assert from "node:assert/strict";
import test from "node:test";

import { readLoginCredentials } from "../src/cli/login.js";

test("non-interactive credentials require both values", async () => {
  await assert.rejects(
    readLoginCredentials({ COOLTO_EMAIL: "alice@example.com" }),
    /必须同时提供/,
  );
});

test("non-interactive credentials are read without modification", async () => {
  assert.deepEqual(
    await readLoginCredentials({
      COOLTO_EMAIL: " alice@example.com ",
      COOLTO_PASSWORD: " secret with spaces ",
    }),
    {
      email: "alice@example.com",
      password: " secret with spaces ",
    },
  );
});

import assert from "node:assert/strict";
import test from "node:test";

import { readConfig } from "../src/config.js";

test("config rejects a missing model key", () => {
  assert.throws(() => readConfig({}), /DEEPSEEK_API_KEY/);
});

test("config applies the default model", () => {
  assert.deepEqual(readConfig({ DEEPSEEK_API_KEY: " secret " }), {
    apiKey: "secret",
    modelId: "deepseek-v4-flash",
  });
});

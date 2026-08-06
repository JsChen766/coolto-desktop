import assert from "node:assert/strict";
import test from "node:test";

import { readConfig } from "../src/config.js";

test("config rejects a missing model key", () => {
  assert.throws(() => readConfig({}), /DEEPSEEK_API_KEY/);
});

test("config applies the default model and thinking level", () => {
  assert.deepEqual(readConfig({ DEEPSEEK_API_KEY: " secret " }), {
    apiKey: "secret",
    modelId: "deepseek-v4-flash",
    apiBaseUrl: "http://127.0.0.1:8080",
    thinkingLevel: "off",
    resumeMaxBulletLines: 3,
  });
  assert.deepEqual(
    readConfig({
      DEEPSEEK_API_KEY: "secret",
      COOLTO_AGENT_THINKING_LEVEL: "high",
    }).thinkingLevel,
    "high",
  );
  assert.deepEqual(
    readConfig({
      DEEPSEEK_API_KEY: "secret",
      COOLTO_RESUME_MAX_BULLET_LINES: "2",
    }).resumeMaxBulletLines,
    2,
  );
  assert.throws(
    () =>
      readConfig({
        DEEPSEEK_API_KEY: "secret",
        COOLTO_AGENT_THINKING_LEVEL: "bogus",
      }),
    /COOLTO_AGENT_THINKING_LEVEL/,
  );
  assert.throws(
    () =>
      readConfig({
        DEEPSEEK_API_KEY: "secret",
        COOLTO_RESUME_MAX_BULLET_LINES: "5",
      }),
    /COOLTO_RESUME_MAX_BULLET_LINES/,
  );
});

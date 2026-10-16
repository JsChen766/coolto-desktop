import assert from "node:assert/strict";
import test from "node:test";

import { setAiProviderOverride } from "../src/ai-provider-runtime.js";
import { readConfig } from "../src/config.js";
import { LOCAL_DESKTOP_ORIGIN } from "../src/local-desktop.js";

test("config uses local origin and env LLM settings without a credit gateway", () => {
  setAiProviderOverride(undefined);
  assert.deepEqual(
    readConfig({
      LLM_BASE_URL: " https://api.example.com/v1 ",
      LLM_API_KEY: " secret ",
      LLM_MODEL: " my-model ",
    }),
    {
      apiKey: "secret",
      modelId: "my-model",
      apiBaseUrl: LOCAL_DESKTOP_ORIGIN,
      llmOperationType: "match_analyze",
      thinkingLevel: "off",
      resumeMaxBulletLines: 3,
    },
  );
});

test("config allows missing API key and keeps OpenAI-compatible defaults", () => {
  setAiProviderOverride(undefined);
  assert.deepEqual(readConfig({}), {
    modelId: "deepseek-chat",
    apiBaseUrl: LOCAL_DESKTOP_ORIGIN,
    llmOperationType: "match_analyze",
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
  assert.equal(
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
  assert.throws(
    () =>
      readConfig({
        DEEPSEEK_API_KEY: "secret",
        COOLTO_LLM_OPERATION_TYPE: "unknown",
      }),
    /COOLTO_LLM_OPERATION_TYPE/,
  );
});

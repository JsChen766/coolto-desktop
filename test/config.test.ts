import assert from "node:assert/strict";
import test from "node:test";

import { readConfig } from "../src/config.js";

test("config rejects missing direct and gateway model access", () => {
  assert.throws(() => readConfig({}), /COOLTO_LLM_GATEWAY_BASE_URL/);
});

test("config allows a production gateway without a provider API key", () => {
  assert.deepEqual(
    readConfig({
      COOLTO_LLM_GATEWAY_BASE_URL: " https://credit.coolto.com.cn ",
    }),
    {
      modelId: "deepseek-v4-flash",
      apiBaseUrl: "http://127.0.0.1:8080",
      llmGatewayBaseUrl: "https://credit.coolto.com.cn",
      llmOperationType: "match_analyze",
      thinkingLevel: "off",
      resumeMaxBulletLines: 3,
    },
  );
});

test("config applies the default model and thinking level", () => {
  assert.deepEqual(readConfig({ DEEPSEEK_API_KEY: " secret " }), {
    apiKey: "secret",
    modelId: "deepseek-v4-flash",
    apiBaseUrl: "http://127.0.0.1:8080",
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
  assert.deepEqual(
    readConfig({
      DEEPSEEK_API_KEY: "secret",
      COOLTO_LLM_GATEWAY_BASE_URL: " https://credit.coolto.com.cn ",
      COOLTO_LLM_OPERATION_TYPE: "resume_generate",
    }),
    {
      apiKey: "secret",
      modelId: "deepseek-v4-flash",
      apiBaseUrl: "http://127.0.0.1:8080",
      llmGatewayBaseUrl: "https://credit.coolto.com.cn",
      llmOperationType: "resume_generate",
      thinkingLevel: "off",
      resumeMaxBulletLines: 3,
    },
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
  assert.throws(
    () =>
      readConfig({
        DEEPSEEK_API_KEY: "secret",
        COOLTO_LLM_OPERATION_TYPE: "unknown",
      }),
    /COOLTO_LLM_OPERATION_TYPE/,
  );
});

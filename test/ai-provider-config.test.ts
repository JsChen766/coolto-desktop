import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeAiProviderConfig,
  readAiProviderFromEnv,
  toAiProviderPublicView,
} from "../src/ai-provider-config.js";
import {
  setAiProviderOverride,
  resolveAiProviderConfig,
} from "../src/ai-provider-runtime.js";
import { createOpenAiCompatibleDependencies } from "../src/agent/openai-compatible-runtime.js";

test("AI provider env aliases never leak the raw key in the public view", () => {
  const fromEnv = readAiProviderFromEnv({
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_API_KEY: "sk-test",
    COOLTO_MODEL: "gpt-4.1-mini",
  });
  const config = normalizeAiProviderConfig(fromEnv);
  assert.equal(config.baseUrl, "https://api.openai.com/v1");
  assert.equal(config.apiKey, "sk-test");
  assert.deepEqual(toAiProviderPublicView(config), {
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4.1-mini",
    hasApiKey: true,
  });
});

test("stored override wins over env and OpenAI-compatible runtime uses that base URL", () => {
  setAiProviderOverride({
    baseUrl: "https://llm.local/v1",
    apiKey: "local-key",
    modelId: "local-model",
  });
  try {
    const resolved = resolveAiProviderConfig({ DEEPSEEK_API_KEY: "env-key" });
    assert.equal(resolved.baseUrl, "https://llm.local/v1");
    assert.equal(resolved.apiKey, "local-key");
    assert.equal(resolved.modelId, "local-model");
    const runtime = createOpenAiCompatibleDependencies(
      resolved.modelId,
      resolved.baseUrl,
      () => resolved.apiKey,
    );
    assert.equal(runtime.model.id, "local-model");
    assert.equal(runtime.model.baseUrl, "https://llm.local/v1");
  } finally {
    setAiProviderOverride(undefined);
  }
});

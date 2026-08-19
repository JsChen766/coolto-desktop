import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_TEMPERATURE,
  createDeepSeekDependencies,
  withCreditMetadata,
} from "../src/agent/create-agent.js";

test("agent sampling uses the confirmed global temperature", () => {
  assert.equal(AGENT_TEMPERATURE, 0.1);
});

test("credit gateway targets the OpenAI-compatible Credit API base", () => {
  const dependencies = createDeepSeekDependencies("deepseek-v4-flash", {
    baseUrl: "https://credit.coolto.com.cn/",
    operationType: "match_analyze",
    getSessionToken: () => "session-token",
  });

  assert.equal(
    dependencies.model.baseUrl,
    "https://credit.coolto.com.cn/api/llm",
  );
});

test("credit metadata preserves the OpenAI body", () => {
  assert.deepEqual(
    withCreditMetadata(
      { model: "deepseek-v4-flash", stream: true },
      "match_analyze",
      "request-1",
    ),
    {
      model: "deepseek-v4-flash",
      stream: true,
      operation_type: "match_analyze",
      request_id: "request-1",
    },
  );
});

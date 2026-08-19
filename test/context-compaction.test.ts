import assert from "node:assert/strict";
import test from "node:test";

import { createDeepSeekDependencies } from "../src/agent/create-agent.js";
import { contextCompactionBudget } from "../src/desktop/main/context-compaction.js";

test("context compaction derives its budget from the selected model", () => {
  const { model } = createDeepSeekDependencies();
  const budget = contextCompactionBudget(model);

  assert.equal(model.contextWindow, 1_000_000);
  assert.equal(model.maxTokens, 384_000);
  assert.ok(budget.thresholdTokens > 500_000);
  assert.ok(budget.thresholdTokens < model.contextWindow - model.maxTokens);
  assert.ok(budget.keepRecentTokens > 400_000);
});

test("context compaction respects a smaller gateway input capacity", () => {
  const { model } = createDeepSeekDependencies();
  const budget = contextCompactionBudget(model, 64_000);

  assert.equal(budget.thresholdTokens, 57_600);
  assert.equal(budget.keepRecentTokens, 43_200);
});

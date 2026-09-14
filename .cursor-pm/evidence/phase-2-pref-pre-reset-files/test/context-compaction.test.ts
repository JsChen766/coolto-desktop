import assert from "node:assert/strict";
import test from "node:test";

import { createDeepSeekDependencies } from "../src/agent/create-agent.js";
import {
  contextCompactionBudget,
  redactProfilePreferenceMessages,
} from "../src/desktop/main/context-compaction.js";

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

test("Profile and Preference compaction redacts values and retains authority markers", () => {
  const messages = [{
    role: "toolResult", toolCallId: "call-1", toolName: "get_user_profile",
    content: [{ type: "text", text: "Alice contact@example.com 香港产品经理" }],
    details: { fullName: "Alice", contactEmail: "contact@example.com", target: "香港产品经理" },
    isError: false, timestamp: Date.now(),
  }, {
    role: "toolResult", toolCallId: "call-2", toolName: "get_preferences",
    content: [{ type: "text", text: "restrained confidential-preference-value" }],
    details: { preferences: [{ value: "confidential-preference-value" }] },
    isError: false, timestamp: Date.now(),
  }, {
    role: "toolResult", toolCallId: "call-3", toolName: "get_preference_suggestions",
    content: [{ type: "text", text: "raw-suggestion-evidence" }],
    details: { evidence: "raw-suggestion-evidence" },
    isError: false, timestamp: Date.now(),
  }, {
    role: "assistant", content: [{
      type: "toolCall", id: "call-4", name: "get_preferences",
      arguments: { value: "assistant-copy-of-preference" },
    }], timestamp: Date.now(),
  }] as never;
  const [redactedProfile, redactedPreference, redactedSuggestion, redactedCall] =
    redactProfilePreferenceMessages(messages, { profileVersion: 12, resolutionHash: "a".repeat(64) });
  const serialized = JSON.stringify([redactedProfile, redactedPreference, redactedSuggestion, redactedCall]);
  assert.equal(serialized.includes("contact@example.com"), false);
  assert.equal(serialized.includes("香港产品经理"), false);
  assert.equal(serialized.includes("confidential-preference-value"), false);
  assert.equal(serialized.includes("raw-suggestion-evidence"), false);
  assert.equal(serialized.includes("assistant-copy-of-preference"), false);
  assert.equal(serialized.includes("profileVersion=12"), true);
  assert.equal(serialized.includes("resolutionHash=" + "a".repeat(64)), true);
});

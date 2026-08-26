import assert from "node:assert/strict";
import test from "node:test";

import { emptyAgentHarnessState } from "../src/agent-task/agent-harness-state.js";
import { pruneAgentHarnessState } from "../src/agent-task/agent-harness-retention.js";

test("ordinary action receipts and policy decisions expire after 90 days", () => {
  const now = Date.UTC(2026, 7, 23);
  const state = emptyAgentHarnessState("owner");
  const old = new Date(now - 91 * 86_400_000).toISOString();
  const fresh = new Date(now - 89 * 86_400_000).toISOString();
  state.actionReceipts = [old, fresh].map((createdAt, index) => ({
    version: 1, id: `receipt-${index}`, ownerId: "owner", taskId: "task",
    runId: "run", toolCallId: `tool-${index}`, toolName: "browser_navigate",
    requestHash: `request-${index}`, targetOrigin: null,
    status: "succeeded", observationBeforeHash: null,
    observationAfterHash: null, evidenceRefs: [], proposalId: null,
    errorCode: null, createdAt,
  }));
  state.policyDecisions = [old, fresh].map((decidedAt, index) => ({
    version: 1, ownerId: "owner", taskId: "task", runId: "run",
    toolCallId: `tool-${index}`, decision: "allow", reasonCode: "allowed",
    requestHash: `request-${index}`, grantId: "grant", grantHash: "hash",
    actionTokenId: null, decidedAt,
  }));
  pruneAgentHarnessState(state, now);
  assert.deepEqual(state.actionReceipts.map((value) => value.id), ["receipt-1"]);
  assert.deepEqual(state.policyDecisions.map((value) => value.toolCallId), ["tool-1"]);
});

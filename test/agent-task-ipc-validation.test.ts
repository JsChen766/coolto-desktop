import assert from "node:assert/strict";
import test from "node:test";

import {
  parseAgentTaskDelegationInput,
  parseAgentTaskId,
} from "../src/desktop/main/agent-task/agent-task-ipc.js";

const valid = {
  conversationId: "conversation-1",
  goal: "Find matching roles",
  allowedDomains: ["jobs.example"],
  blockedDomains: [],
  allowedActions: ["browser.read", "task.lifecycle"],
  jobCriteria: { minimumMatch: 80 },
  assetPolicy: {},
  answerPolicy: {},
  unattended: true,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

test("AgentTask IPC accepts only the confirmed delegation surface", () => {
  assert.deepEqual(parseAgentTaskDelegationInput(valid), valid);
  assert.equal(parseAgentTaskId(" task-1 "), "task-1");
  assert.throws(
    () => parseAgentTaskDelegationInput({ ...valid, serverWorkflow: "auto_apply" }),
    /不支持字段/u,
  );
});

test("AgentTask IPC rejects malformed collections and oversized payloads", () => {
  assert.throws(
    () => parseAgentTaskDelegationInput({ ...valid, allowedDomains: "jobs.example" }),
    /字符串数组/u,
  );
  assert.throws(
    () => parseAgentTaskDelegationInput({ ...valid, unattended: "yes" }),
    /boolean/u,
  );
  assert.throws(
    () => parseAgentTaskDelegationInput({
      ...valid,
      jobCriteria: { text: "x".repeat(60_000) },
    }),
    /过大/u,
  );
});

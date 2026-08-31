import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";

test("a stale duplicate token cannot inherit a prior succeeded receipt", async () => {
  const ownerId = "owner-ledger-safety";
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await services.tasks.create("conversation-ledger", "Inspect role");
  const now = Date.now();
  const grant = await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.control"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "bsf3",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  const run = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const issue = () => services.ledger.issue({
    ownerId, taskId: task.id, runId: run.id, toolName: "browser_reload",
    requestHash: "same-request", grantHash: grant.contentHash,
    targetOrigin: "https://jobs.example", tabId: "tab-1", observationHash: null,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  const first = await issue();
  const input = {
    toolCallId: "call-first", targetOrigin: "https://jobs.example",
    tabId: "tab-1", observationHash: null, status: "succeeded" as const,
    observationAfterHash: null,
  };
  const succeeded = await services.ledger.consume({ tokenId: first.id, ...input });
  assert.equal(succeeded.status, "succeeded");

  const stale = await issue();
  await services.tasks.setHostStatus(task.id, "paused");
  await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const blocked = await services.ledger.consume({
    tokenId: stale.id, ...input, toolCallId: "call-stale",
  });
  assert.equal(blocked.status, "blocked");
  assert.notEqual(blocked.id, succeeded.id);
  assert.equal(blocked.errorCode, "action_token_context_mismatch_or_expired");
});

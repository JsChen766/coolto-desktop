import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { clearUserServices } from "../src/desktop/main/clear-user-services.js";
import type { UserServices } from "../src/desktop/main/user-services.js";

test("account change revokes gate, run and immutable grant", async () => {
  const ownerId = "owner";
  const harness = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await harness.tasks.create("conversation", "Monitor roles");
  const now = Date.now();
  await harness.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.read", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be2",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await harness.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const calls: string[] = [];
  const current = {
    agentHarness: harness,
    agent: { cancel: () => calls.push("cancel") },
    selectedFiles: { clear: () => calls.push("files") },
    reminderScheduler: { dispose: () => calls.push("reminders") },
    agentTaskScheduler: { dispose: () => calls.push("task-scheduler") },
  } as unknown as UserServices;
  await clearUserServices({
    current,
    reason: "account_changed",
    browser: { revokeWriteAccess: (reason: string) => calls.push(`gate:${reason}`) } as never,
    status: { clear: () => calls.push("status") } as never,
  });
  const active = await harness.grants.getActive(task.id);
  assert.equal(active.revocation?.reason, "account_changed");
  assert.equal((await harness.tasks.get(task.id)).status, "paused");
  assert.deepEqual(calls, [
    "gate:account_changed", "status", "cancel", "files",
    "reminders", "task-scheduler",
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import { AgentTaskRunner } from "../src/agent-task/agent-task-runner.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { TaskLifecycleController } from "../src/agent-task/task-lifecycle-controller.js";

async function setup(suffix: string) {
  const ownerId = `owner-${suffix}`;
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await services.tasks.create(`conversation-${suffix}`, "Monitor roles");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.read", "task.lifecycle"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "bsf3",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  const run = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  services.runtimeProjection.start({
    callId: `call-${suffix}`, taskId: task.id, runId: run.id,
    toolName: "browser_snapshot", tabId: "tab", targetOrigin: "https://jobs.example",
    startedAt: new Date().toISOString(),
  });
  let access = true;
  const revoke = () => { access = false; };
  return { services, task, run, revoke, access: () => access };
}

test("waiting and completed lifecycle transitions close browser access", async (t) => {
  await t.test("waiting", async () => {
    const value = await setup("waiting");
    const lifecycle = new TaskLifecycleController(
      value.task.conversationId, value.services, value.revoke,
    );
    const task = await lifecycle.wait({
      reason: "external_event", eventTypes: ["mail.changed"], summary: "wait",
    });
    assert.equal(task.status, "waiting");
    assert.equal(value.access(), false);
    assert.equal(value.services.runtimeProjection.current(value.task.id, value.run.id), null);
  });

  await t.test("completed", async () => {
    const value = await setup("completed");
    const lifecycle = new TaskLifecycleController(
      value.task.conversationId, value.services, value.revoke,
    );
    const task = await lifecycle.complete({ partial: false, summary: "done" });
    assert.equal(task.status, "completed");
    assert.equal(value.access(), false);
    assert.equal(value.services.runtimeProjection.current(value.task.id, value.run.id), null);
  });
});

test("grant revocation closes browser access and invalidates the active action", async () => {
  const value = await setup("revoked");
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => undefined,
    cancel: () => undefined,
    revokeBrowserAccess: value.revoke,
  });
  const task = await runner.revoke(value.task.id, "user");
  assert.equal(task.status, "paused");
  assert.equal((await value.services.grants.getActive(task.id)).revocation?.reason, "user");
  assert.equal(value.access(), false);
  assert.equal(value.services.runtimeProjection.current(value.task.id, value.run.id), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import { AgentTaskRunner } from "../src/agent-task/agent-task-runner.js";
import { AgentTaskScheduler } from "../src/agent-task/agent-task-scheduler.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ManagedTaskPolicyHooks } from "../src/agent-task/managed-task-policy-hooks.js";
import { TaskLifecycleController } from "../src/agent-task/task-lifecycle-controller.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import { createAgentTaskLifecycleTools } from "../src/tools/agent-task-lifecycle.js";
import { applyToolCapabilities } from "../src/tools/tool-capabilities.js";

async function setup(startRun = true) {
  const ownerId = "owner";
  const repository = new AgentHarnessStateRepository(
    ownerId,
    new MemoryAgentHarnessStatePersistence(),
  );
  const services = new AgentHarnessServices(ownerId, repository);
  const task = await services.tasks.create("conversation", "Monitor roles");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["task.lifecycle", "browser.read"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be2-v1",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  const run = startRun
    ? await services.tasks.startRun({ taskId: task.id, wakeCause: "user" })
    : undefined;
  return { services, task, run };
}

test("task wait checkpoints before acknowledging delivered events", async () => {
  const { services, task } = await setup();
  const event = await services.events.enqueue({
    taskId: task.id, source: "timer", type: "timer.ready",
    trust: "trusted_system", occurredAt: new Date().toISOString(),
    dedupeKey: "timer:1", payloadRef: null, payloadHash: "hash",
  });
  await services.events.markDelivered(event.id);
  const lifecycle = new TaskLifecycleController("conversation", services);
  const waiting = await lifecycle.wait({
    reason: "external_event", eventTypes: ["mail.changed"], summary: "等待邮件",
  });
  assert.equal(waiting.status, "waiting");
  assert.ok(waiting.latestCheckpointId);
  assert.equal((await services.events.pending(task.id)).length, 0);
});

test("task runner uses the existing prompt runtime and recovers interrupted runs", async () => {
  const first = await setup(false);
  const lifecycle = new TaskLifecycleController("conversation", first.services);
  const prompts: string[] = [];
  const runner = new AgentTaskRunner(first.services, {
    prompt: async (_conversationId, content) => {
      prompts.push(content);
      await lifecycle.complete({ partial: false, summary: "done" });
    },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  assert.equal((await runner.start(first.task.id)).status, "completed");
  assert.match(prompts[0] ?? "", /coolto_agent_task_start/u);

  const second = await setup();
  const active = await second.services.grants.getActive(second.task.id);
  await second.services.ledger.issue({
    ownerId: "owner", taskId: second.task.id, runId: second.run!.id,
    toolName: "browser_navigate", requestHash: "interrupted-request",
    grantHash: active.grant!.contentHash, targetOrigin: "https://jobs.example",
    tabId: "tab", observationHash: null,
    expiresAt: new Date(Date.now() + 30_000).toISOString(),
  });
  const recovery = new AgentTaskRunner(second.services, {
    prompt: async () => undefined,
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  const recovered = await recovery.recoverInterrupted();
  assert.equal(recovered[0]?.status, "paused");
  assert.equal((await second.services.tasks.get(second.task.id)).activeRunId, null);
  assert.equal(
    (await second.services.ledger.listReceipts(second.task.id))[0]?.status,
    "uncertain",
  );
});

test("task completion tool terminates and mixed terminal batches are blocked", async () => {
  const { services, task } = await setup();
  const lifecycle = new TaskLifecycleController("conversation", services);
  const complete = createAgentTaskLifecycleTools(lifecycle)
    .find((tool) => tool.name === "task_complete")!;
  const result = await complete.execute("complete", {
    partial: false, summary: "任务完成",
  });
  assert.equal(result.terminate, true);
  assert.equal((await services.tasks.get(task.id)).status, "completed");

  const next = await setup();
  const tools = applyToolCapabilities([
    ...createAgentTaskLifecycleTools(
      new TaskLifecycleController("conversation", next.services),
    ),
    { name: "browser_snapshot", label: "snapshot", description: "",
      parameters: {} as never, execute: async () => ({ content: [], details: {} }) },
  ]);
  const browser = { getActiveTab: () => null } as BrowserAgentController;
  const hooks = new ManagedTaskPolicyHooks({
    conversationId: "conversation", services: next.services, browser, tools,
    sitePolicyAllows: () => true,
  });
  const blocked = await hooks.beforeToolCall({
    assistantMessage: { content: [
      { type: "toolCall", id: "complete", name: "task_complete", arguments: {} },
      { type: "toolCall", id: "snapshot", name: "browser_snapshot", arguments: {} },
    ] } as never,
    toolCall: { type: "toolCall", id: "complete", name: "task_complete", arguments: {} },
    args: {}, context: {} as never,
  });
  assert.equal(blocked?.block, true);
  assert.equal(blocked?.terminate, true);
});

test("local scheduler wakes a timer task only through a generic event", async () => {
  const value = await setup();
  const lifecycle = new TaskLifecycleController("conversation", value.services);
  await lifecycle.wait({
    reason: "timer",
    wakeAfter: new Date(Date.now() - 1_000).toISOString(),
    summary: "wait for local timer",
  });
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => {
      await lifecycle.complete({ partial: false, summary: "timer handled" });
    },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  const scheduler = new AgentTaskScheduler(value.services, runner);
  await scheduler.tick();
  assert.equal((await value.services.tasks.get(value.task.id)).status, "completed");
  const events = await value.services.events.all(value.task.id);
  assert.equal(events[0]?.type, "timer.ready");
  assert.equal(events[0]?.status, "acknowledged");
});

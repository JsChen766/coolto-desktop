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
import { AgentTaskProposalService } from
  "../src/desktop/main/agent-task/agent-task-proposal-service.js";
import { resumeJobLoopTemplate } from
  "../src/tools/ai-native-loop-templates.js";
import { followUpLoopTemplate } from
  "../src/tools/ai-native-extended-loop-templates.js";

async function setup(startRun = true, unattended = true) {
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
    unattended, validFrom: new Date(now - 1000).toISOString(),
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
  const revoked: string[] = [];
  const lifecycle = new TaskLifecycleController(
    "conversation", services, (reason) => revoked.push(reason),
  );
  const waiting = await lifecycle.wait({
    reason: "external_event", eventTypes: ["mail.changed"], summary: "等待邮件",
  });
  assert.equal(waiting.status, "waiting");
  assert.ok(waiting.latestCheckpointId);
  assert.deepEqual(revoked, ["task_waiting"]);
  assert.equal((await services.events.pending(task.id)).length, 0);
});

test("task runner uses the existing prompt runtime and recovers interrupted runs", async () => {
  const first = await setup(false);
  const revoked: string[] = [];
  const lifecycle = new TaskLifecycleController(
    "conversation", first.services, (reason) => revoked.push(reason),
  );
  const prompts: string[] = [];
  const runner = new AgentTaskRunner(first.services, {
    prompt: async (_conversationId, content) => {
      prompts.push(content);
      await lifecycle.complete({ partial: false, summary: "done" });
    },
    cancel: () => undefined,
    revokeBrowserAccess: (reason) => revoked.push(reason),
  });
  assert.equal((await runner.start(first.task.id)).status, "completed");
  assert.ok(revoked.includes("task_completed"));
  assert.match(prompts[0] ?? "", /coolto_agent_task_start/u);
  assert.match(prompts[0] ?? "", /coolto_delegation_context/u);
  assert.match(prompts[0] ?? "", /"allowedDomains":\["jobs\.example"\]/u);
  assert.match(prompts[0] ?? "", /不得因为结果不理想或希望获得更多信息而反复追问/u);

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

test("manual resume with pending events remains a supervised user wake", async () => {
  const value = await setup(false, false);
  await value.services.events.enqueue({
    taskId: value.task.id, source: "browser", type: "browser.changed",
    trust: "external_untrusted", occurredAt: new Date().toISOString(),
    dedupeKey: "browser:manual-resume", payloadRef: null, payloadHash: "hash",
  });
  const lifecycle = new TaskLifecycleController("conversation", value.services);
  let wakeCause: string | undefined;
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => {
      wakeCause = (await value.services.tasks.getActiveRun(value.task.id)).wakeCause;
      await lifecycle.complete({ partial: false, summary: "handled" });
    },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  assert.equal((await runner.resume(value.task.id)).status, "completed");
  assert.equal(wakeCause, "user");
  assert.equal((await value.services.events.pending(value.task.id)).length, 0);
});

test("local scheduler wakes a timer task only through a generic event", async () => {
  const value = await setup();
  const lifecycle = new TaskLifecycleController("conversation", value.services);
  const wakeAfter = new Date(Date.now() + 1_000).toISOString();
  await lifecycle.wait({
    reason: "timer",
    wakeAfter,
    summary: "wait for local timer",
  });
  let wakeCause: string | undefined;
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => {
      wakeCause = (await value.services.tasks.getActiveRun(value.task.id)).wakeCause;
      await lifecycle.complete({ partial: false, summary: "timer handled" });
    },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  const scheduler = new AgentTaskScheduler(value.services, runner);
  await scheduler.tick(Date.parse(wakeAfter) + 1);
  assert.equal(wakeCause, "environment_event");
  assert.equal((await value.services.tasks.get(value.task.id)).status, "completed");
  const events = await value.services.events.all(value.task.id);
  assert.equal(events[0]?.type, "timer.ready");
  assert.equal(events[0]?.status, "acknowledged");
});

test("timer wait rejects missing, invalid and past wakeAfter", async () => {
  for (const wakeAfter of [undefined, "not-a-date", new Date(0).toISOString()]) {
    const value = await setup();
    const lifecycle = new TaskLifecycleController("conversation", value.services);
    await assert.rejects(lifecycle.wait({
      reason: "timer", ...(wakeAfter ? { wakeAfter } : {}), summary: "invalid timer",
    }), /未来的 wakeAfter/u);
    assert.equal((await value.services.tasks.get(value.task.id)).status, "running");
  }
});

test("local scheduler resumes an approval wait after the host records a decision", async () => {
  const value = await setup();
  const lifecycle = new TaskLifecycleController("conversation", value.services);
  await lifecycle.wait({
    reason: "approval", eventTypes: ["approval.accepted", "approval.rejected"],
    summary: "wait for final submission confirmation",
  });
  await value.services.events.enqueue({
    taskId: value.task.id, source: "approval", type: "approval.accepted",
    trust: "trusted_system", occurredAt: new Date().toISOString(),
    dedupeKey: "approval:submission:1", payloadRef: null, payloadHash: "decision",
  });
  let resumed = false;
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => {
      resumed = true;
      await lifecycle.complete({ partial: false, summary: "approval handled" });
    },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  await new AgentTaskScheduler(value.services, runner).tick();
  assert.equal(resumed, true);
  assert.equal((await value.services.tasks.get(value.task.id)).status, "completed");
});

test("scheduler auto-starts formal loops but leaves generic queued tasks manual", async () => {
  const repository = new AgentHarnessStateRepository(
    "owner", new MemoryAgentHarnessStatePersistence(),
  );
  const services = new AgentHarnessServices("owner", repository);
  const proposals = new AgentTaskProposalService(services);
  const loop = proposals.prepare(resumeJobLoopTemplate({
    conversationId: "loop-conversation", goal: "Find roles",
    resumeId: "resume-1", resumeTitle: "Resume",
    resumeContentHash: "a".repeat(64),
    sources: [{ provider: "lever", sourceKey: "acme", company: "Acme" }],
    applicationDomains: [], expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }));
  const loopId = await proposals.execute(loop.id);
  const generic = proposals.prepare({
    conversationId: "manual-conversation", goal: "Generic task",
    allowedDomains: [], blockedDomains: [], allowedActions: [],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, unattended: false,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const genericId = await proposals.execute(generic.id);
  let started = false;
  const prepared: string[] = [];
  const runner = new AgentTaskRunner(services, {
    prompt: async (conversationId) => {
      started = conversationId === "loop-conversation";
      await new TaskLifecycleController(conversationId, services)
        .complete({ partial: false, summary: "loop started" });
    },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  await new AgentTaskScheduler(
    services, runner, async (taskId) => { prepared.push(taskId); },
  ).tick();
  assert.equal(started, true);
  assert.deepEqual(prepared, [loopId]);
  assert.equal((await services.tasks.get(loopId)).status, "completed");
  assert.equal((await services.tasks.get(genericId)).status, "queued");
});

test("scheduler waits for a formal Loop autoStartAfter", async () => {
  const repository = new AgentHarnessStateRepository(
    "owner", new MemoryAgentHarnessStatePersistence(),
  );
  const services = new AgentHarnessServices("owner", repository);
  const proposals = new AgentTaskProposalService(services);
  const now = Date.now();
  const autoStartAfter = new Date(now + 30_000).toISOString();
  const proposal = proposals.prepare(followUpLoopTemplate({
    conversationId: "conversation", goal: "Follow up", applicationId: "app-1",
    allowedDomains: ["mail.example"], checkIntervalHours: 24, autoStartAfter,
    expiresAt: new Date(now + 60_000).toISOString(),
  }));
  const taskId = await proposals.execute(proposal.id);
  let starts = 0;
  const lifecycle = new TaskLifecycleController("conversation", services);
  const runner = new AgentTaskRunner(services, {
    prompt: async () => { starts += 1; await lifecycle.complete({ partial: false, summary: "done" }); },
    cancel: () => undefined, revokeBrowserAccess: () => undefined,
  });
  const scheduler = new AgentTaskScheduler(services, runner);
  await scheduler.tick(now);
  assert.equal(starts, 0);
  assert.equal((await services.tasks.get(taskId)).status, "queued");
  await scheduler.tick(Date.parse(autoStartAfter));
  assert.equal(starts, 1);
});

test("failed automatic Browser preparation preserves queued task state", async () => {
  const repository = new AgentHarnessStateRepository(
    "owner", new MemoryAgentHarnessStatePersistence(),
  );
  const services = new AgentHarnessServices("owner", repository);
  const proposals = new AgentTaskProposalService(services);
  const proposal = proposals.prepare(resumeJobLoopTemplate({
    conversationId: "conversation", goal: "Find roles",
    resumeId: "resume-1", resumeTitle: "Resume",
    resumeContentHash: "a".repeat(64),
    sources: [{ provider: "lever", sourceKey: "acme", company: "Acme" }],
    applicationDomains: [], expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }));
  const taskId = await proposals.execute(proposal.id);
  const runner = new AgentTaskRunner(services, {
    prompt: async () => { throw new Error("must not run"); },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  await new AgentTaskScheduler(
    services, runner, async () => { throw new Error("browser unavailable"); },
  ).tick();
  assert.equal((await services.tasks.get(taskId)).status, "queued");
});

test("revoking a task invokes host cleanup without resuming the Agent", async () => {
  const value = await setup();
  const cleaned: string[] = [];
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => { throw new Error("must not run"); },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
    cleanupTask: async (taskId) => { cleaned.push(taskId); },
  });
  await runner.revoke(value.task.id, "user");
  assert.deepEqual(cleaned, [value.task.id]);
});

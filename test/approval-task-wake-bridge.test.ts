import assert from "node:assert/strict";
import test from "node:test";

import { bindApprovalTaskWake } from
  "../src/agent-task/approval-task-wake-bridge.js";
import { createDefaultStagePolicy } from "../src/agent-task/stage-policy.js";
import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { TaskLifecycleController } from
  "../src/agent-task/task-lifecycle-controller.js";
import { ActionExecutorRegistry } from "../src/approvals/executor-registry.js";
import { ApprovalManager } from "../src/approvals/approval-manager.js";
import { ApprovalStore } from "../src/approvals/approval-store.js";

test("accepted and rejected approvals wake the waiting AgentTask generically", async () => {
  assert.equal(await decisionEvent("accept"), "approval.accepted");
  assert.equal(await decisionEvent("reject"), "approval.rejected");
  assert.equal(await decisionEvent("accept", true), "approval.accepted");
});

test("host accepted approval advances a staged task to approved_action", async () => {
  const value = await setupBridge(true);
  await value.approvals.resolve(value.request.id, { type: "accept" });
  const run = await value.services.tasks.getActiveRun(value.task.id);
  assert.equal(value.services.stages.current(value.task.id, run.id)?.stage, "approved_action");
});

test("an unrelated approval created while waiting cannot wake the task", async () => {
  const value = await setupBridge();
  await value.lifecycle.wait({
    reason: "approval", eventTypes: ["approval.accepted", "approval.rejected"],
    summary: "waiting",
  });
  const unrelated = await value.approvals.request({
    actionType: "test.approval", scopeKey: "unrelated", risk: "write",
    title: "Other", description: "Other", preview: { summary: [] },
  }, {});
  await value.approvals.resolve(unrelated.id, { type: "accept" });
  assert.equal((await value.services.events.pending(value.task.id)).length, 0);
});

async function decisionEvent(
  decision: "accept" | "reject",
  beforeWait = false,
): Promise<string> {
  const value = await setupBridge();
  if (beforeWait) await value.approvals.resolve(value.request.id, { type: decision });
  await value.lifecycle.wait({
    reason: "approval", eventTypes: ["approval.accepted", "approval.rejected"],
    summary: "waiting",
  });
  if (!beforeWait) await value.approvals.resolve(value.request.id, { type: decision });
  return (await value.services.events.pending(value.task.id))[0]!.type;
}

async function setupBridge(staged = false) {
  const services = new AgentHarnessServices(
    "owner",
    new AgentHarnessStateRepository(
      "owner", new MemoryAgentHarnessStatePersistence(),
    ),
  );
  const task = await services.tasks.create("conversation", "approval loop");
  const now = Date.now();
  await services.grants.create({
    ownerId: "owner", taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [], blockedDomains: [], allowedActions: ["task.lifecycle"],
    ...(staged ? { stagePolicy: createDefaultStagePolicy(["task.lifecycle"]) } : {}),
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "be7",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  const run = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  if (staged) {
    const active = await services.grants.getActive(task.id);
    services.stages.start({
      ownerId: "owner", taskId: task.id, runId: run.id,
      grantHash: active.grant!.contentHash,
    });
  }
  const executors = new ActionExecutorRegistry();
  executors.register("test.approval", {
    execute: async () => ({ summary: "accepted" }),
  });
  const approvals = new ApprovalManager(new ApprovalStore(), executors);
  bindApprovalTaskWake(approvals, "conversation", services);
  const request = await approvals.request({
    actionType: "test.approval", scopeKey: "test", risk: "write",
    title: "Confirm", description: "Confirm", preview: { summary: [] },
  }, {});
  return {
    services, task, approvals, request,
    lifecycle: new TaskLifecycleController("conversation", services),
  };
}

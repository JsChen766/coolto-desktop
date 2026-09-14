import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import { AgentTaskRunner } from "../src/agent-task/agent-task-runner.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { TaskLifecycleController } from "../src/agent-task/task-lifecycle-controller.js";
import { createDefaultStagePolicy } from "../src/agent-task/stage-policy.js";

async function setup(localVersion: number | undefined | null = 7) {
  const ownerId = "owner";
  const repository = new AgentHarnessStateRepository(
    ownerId, new MemoryAgentHarnessStatePersistence(),
  );
  const services = new AgentHarnessServices(ownerId, repository);
  const task = await services.tasks.create("conversation", "reconcile profile context");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: [], blockedDomains: [], allowedActions: ["task.lifecycle", "browser.read"],
    stagePolicy: createDefaultStagePolicy(["task.lifecycle", "browser.read"]),
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {}, unattended: false,
    validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "stage-test",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  const run = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  services.stages.start({ ownerId, taskId: task.id, runId: run.id, grantHash: (await services.grants.getActive(task.id)).grant!.contentHash });
  const profileLocalVersion = localVersion === null ? undefined : localVersion;
  type TestContext = { profileVersion: number; profileLocalVersion?: number; resolutionHash: string };
  let context: TestContext = profileLocalVersion === undefined
    ? { profileVersion: 2, resolutionHash: "a".repeat(64) }
    : { profileVersion: 2, profileLocalVersion, resolutionHash: "a".repeat(64) };
  services.profilePreferenceContext = async () => context;
  return { services, task, run, setContext: (next: TestContext) => { context = next; } };
}

test("checkpoint records stage and Profile Preference versions without self-escalating", async () => {
  const value = await setup();
  const checkpoint = await new TaskLifecycleController("conversation", value.services).checkpoint({ summary: "observed" });
  assert.equal(checkpoint.currentStage, "observe");
  assert.equal(checkpoint.profileVersion, 2);
  assert.equal(checkpoint.profileLocalVersion, 7);
  assert.equal(checkpoint.preferenceResolutionHash, "a".repeat(64));
  assert.equal(value.services.stages.current(value.task.id, value.run.id)?.stage, "observe");
  assert.deepEqual(await value.services.tasks.latestCheckpoint(value.task.id), checkpoint);
});

test("resume fails closed when Profile or Preference context drifted", async () => {
  const value = await setup();
  const lifecycle = new TaskLifecycleController("conversation", value.services);
  await lifecycle.checkpoint({ summary: "checkpoint" });
  await value.services.tasks.finishRun({
    taskId: value.task.id, runId: value.run.id, taskStatus: "waiting",
    waiting: { reason: "external_event", wakeAfter: null, eventTypes: [] }, stopReason: "wait",
  });
  value.setContext({ profileVersion: 2, profileLocalVersion: 8, resolutionHash: "a".repeat(64) });
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => undefined, cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  await assert.rejects(() => runner.resume(value.task.id), /Profile 已变化/u);
});

test("legacy Agent checkpoint without Profile local version fails closed", async () => {
  const value = await setup(null);
  const lifecycle = new TaskLifecycleController("conversation", value.services);
  await lifecycle.checkpoint({ summary: "legacy checkpoint" });
  await value.services.tasks.finishRun({
    taskId: value.task.id, runId: value.run.id, taskStatus: "waiting",
    waiting: { reason: "external_event", wakeAfter: null, eventTypes: [] }, stopReason: "wait",
  });
  value.setContext({ profileVersion: 2, profileLocalVersion: 7, resolutionHash: "a".repeat(64) });
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => undefined, cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  await assert.rejects(() => runner.resume(value.task.id), /本机投影缺少版本/u);
});

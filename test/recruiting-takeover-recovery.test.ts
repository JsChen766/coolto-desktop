import assert from "node:assert/strict";
import test from "node:test";
import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import { AgentHarnessStateRepository, MemoryAgentHarnessStatePersistence } from "../src/agent-task/agent-harness-state-repository.js";
import { ManagedTaskPolicyHooks } from "../src/agent-task/managed-task-policy-hooks.js";
import { ManagedTaskExecutionState } from "../src/agent-task/managed-task-execution-state.js";
import type { ActionTokenV1 } from "../src/agent-task/receipt-types.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import { isBrowserSitePolicyAllowed } from "../src/browser/site-policy-registry.js";
import { applyToolCapabilities } from "../src/tools/tool-capabilities.js";
import {
  createRecruitingTakeoverState, enterRecruitingTakeover, resumeRecruitingTakeover,
  validateRecruitingTakeover, type RecruitingTakeoverContext,
} from "../src/browser/recruiting-takeover-contract.js";

const context: RecruitingTakeoverContext = { taskId: "task-1", runId: "run-1", tabId: "tab-1", origin: "https://boss-zhipin.test", observationHash: "obs-1", grantHash: "grant-1" };

test("takeover pauses observation and resumes the same task after re-observation", () => {
  const paused = enterRecruitingTakeover(createRecruitingTakeoverState(context), "captcha");
  assert.equal(paused.status, "takeover"); assert.equal(paused.reason, "captcha");
  const resumed = resumeRecruitingTakeover(paused, { ...context, runId: "run-2", observationHash: "obs-2" });
  assert.equal(resumed.ok, true);
  if (resumed.ok) { assert.equal(resumed.state.status, "agent"); assert.equal(resumed.state.context.observationHash, "obs-2"); assert.equal(resumed.state.context.taskId, context.taskId); }
});

test("old write token invalidates on observation drift or an empty hash", () => {
  const paused = enterRecruitingTakeover(createRecruitingTakeoverState(context), "otp");
  assert.equal(validateRecruitingTakeover(paused, { ...context, observationHash: "obs-2" })?.code, "observation_stale");
  const empty = enterRecruitingTakeover(createRecruitingTakeoverState({ ...context, observationHash: "" }), "otp");
  assert.equal(validateRecruitingTakeover(empty, { ...context, observationHash: "" })?.code, "observation_stale");
  assert.equal(resumeRecruitingTakeover(empty, { ...context, observationHash: "" }).ok, false);
});

test("takeover resume invalidates on task, tab, origin, or grant drift", () => {
  const paused = enterRecruitingTakeover(createRecruitingTakeoverState(context), "otp");
  for (const drift of [{ taskId: "task-2" }, { tabId: "tab-2" }, { origin: "https://linkedin.test" }, { grantHash: "grant-old" }]) {
    const result = resumeRecruitingTakeover(paused, { ...context, ...drift });
    assert.equal(result.ok, false);
    if (!result.ok) { assert.equal(result.state.status, "invalidated"); assert.match(result.failure.code, /drift|stale|mismatch/u); }
  }
});

test("managed form takeover blocks model observation and resumes the same task", async () => {
  const ownerId = "owner-recruiting-takeover";
  const services = new AgentHarnessServices(ownerId, new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()));
  const task = await services.tasks.create("conversation-takeover", "Review synthetic recruiting form");
  const now = Date.now();
  await services.grants.create({ ownerId, taskId: task.id, taskGoalHash: task.goalHash, allowedDomains: ["boss-zhipin.test"], blockedDomains: [], allowedActions: ["browser.read", "browser.write", "task.lifecycle"], jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {}, unattended: false, validFrom: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "del-form", confirmedByUserAt: new Date(now).toISOString() });
  const firstRun = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const tab = { id: "tab-1", title: "Apply", url: "https://boss-zhipin.test/jobs/1/apply", isActive: true, isLoading: false, canGoBack: false, canGoForward: false };
  const browser = { getActiveTab: () => tab, listTabs: () => [tab] } as unknown as BrowserAgentController;
  const tools = applyToolCapabilities(["browser_recruiting_form_observe", "browser_snapshot", "browser_recruiting_form_fill", "task_need_user"].map((name) => ({ name, label: name, description: "", parameters: {} as never, execute: async () => ({ content: [], details: {} }) })));
  let revoked = 0;
  const hooks = new ManagedTaskPolicyHooks({ conversationId: task.conversationId, services, browser, tools, sitePolicyAllows: isBrowserSitePolicyAllowed, revokeBrowserAccess: () => { revoked += 1; } });
  assert.equal(await before(hooks, "browser_recruiting_form_observe", "observe-invalid"), undefined);
  await after(hooks, "browser_recruiting_form_observe", "observe-invalid", { mode: "synthetic_review", surface: "form", tabId: tab.id, origin: "https://boss-zhipin.test", observationHash: "", tab: { id: tab.id, url: tab.url } });
  assert.equal((await before(hooks, "browser_recruiting_form_fill", "fill-invalid"))?.block, true);
  assert.equal(await before(hooks, "browser_recruiting_form_observe", "observe-1"), undefined);
  await after(hooks, "browser_recruiting_form_observe", "observe-1", { mode: "takeover", surface: "captcha", tabId: tab.id, origin: "https://boss-zhipin.test", observationHash: "obs-1", tab: { id: tab.id, url: tab.url } });
  assert.equal((await before(hooks, "browser_snapshot", "snapshot-1"))?.block, true);
  assert.equal(revoked, 1);
  assert.equal(await before(hooks, "task_need_user", "need-user"), undefined);
  await services.tasks.setHostStatus(task.id, "paused");
  const resumedRun = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  assert.notEqual(resumedRun.id, firstRun.id);
  assert.equal(await before(hooks, "browser_recruiting_form_observe", "observe-2"), undefined);
  await after(hooks, "browser_recruiting_form_observe", "observe-2", { mode: "takeover", surface: "captcha", tabId: tab.id, origin: "https://boss-zhipin.test", observationHash: "obs-2", tab: { id: tab.id, url: tab.url } });
  assert.equal((await before(hooks, "browser_snapshot", "snapshot-2"))?.block, true);
  assert.equal(await before(hooks, "browser_recruiting_form_observe", "observe-3"), undefined);
  await after(hooks, "browser_recruiting_form_observe", "observe-3", { mode: "synthetic_review", surface: "form", tabId: tab.id, origin: "https://boss-zhipin.test", observationHash: "obs-3", tab: { id: tab.id, url: tab.url } });
  assert.equal(await before(hooks, "browser_recruiting_form_fill", "fill-1", { fillId: "fullName", value: "Ada" }), undefined);
});
test("task switching clears observation and late call state", async () => {
  const ownerId = "owner-task-switch";
  const services = new AgentHarnessServices(ownerId, new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()));
  const taskA = await services.tasks.create("conversation-task-switch", "Task A");
  const now = Date.now();
  await services.grants.create({ ownerId, taskId: taskA.id, taskGoalHash: taskA.goalHash, allowedDomains: ["boss-zhipin.test"], blockedDomains: [], allowedActions: ["browser.read", "browser.write", "task.lifecycle"], jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {}, unattended: false, validFrom: new Date(now - 1_000).toISOString(), expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "del-form", confirmedByUserAt: new Date(now).toISOString() });
  const runA = await services.tasks.startRun({ taskId: taskA.id, wakeCause: "user" });
  const browser = { getActiveTab: () => ({ id: "tab-1", title: "Apply", url: "https://boss-zhipin.test/jobs/1/apply" }) } as unknown as BrowserAgentController;
  const execution = new ManagedTaskExecutionState("conversation-task-switch", services, browser);
  execution.start("observe-a", { taskId: taskA.id, runId: runA.id, toolName: "browser_recruiting_form_observe" });
  await execution.after({ toolCall: { type: "toolCall", name: "browser_recruiting_form_observe", id: "observe-a", arguments: {} }, args: {}, assistantMessage: {} as never, context: {} as never, result: { content: [], details: { mode: "synthetic_review", surface: "form", tabId: "tab-1", origin: "https://boss-zhipin.test", observationHash: "obs-a", tab: { id: "tab-1", url: "https://boss-zhipin.test/jobs/1/apply" } } }, isError: false });
  assert.equal(execution.observation(runA.id, "tab-1", "https://boss-zhipin.test/jobs/1/apply").hash !== null, true);
  const token: ActionTokenV1 = { version: 1, id: "late-token", ownerId, taskId: taskA.id, runId: runA.id, toolName: "browser_recruiting_form_fill", requestHash: "request", grantHash: "grant", targetOrigin: "https://boss-zhipin.test", tabId: "tab-1", observationHash: "obs-a", expiresAt: new Date(now + 60_000).toISOString(), consumedAt: null, receiptId: null };
  execution.start("late-call", { taskId: taskA.id, runId: runA.id, toolName: "browser_recruiting_form_fill" });
  execution.bindAction("late-call", token, null);
  const taskB = await services.tasks.create("conversation-task-switch", "Task B");
  execution.resetForTask(taskB.id);
  assert.equal(execution.observation(runA.id, "tab-1", "https://boss-zhipin.test/jobs/1/apply").hash, null);
  await execution.after({ toolCall: { type: "toolCall", name: "browser_recruiting_form_fill", id: "late-call", arguments: {} }, args: {}, assistantMessage: {} as never, context: {} as never, result: { content: [], details: { mode: "takeover", surface: "captcha", tabId: "tab-1", origin: "https://boss-zhipin.test", observationHash: "late", tab: { id: "tab-1", url: "https://boss-zhipin.test/jobs/1/apply" } } }, isError: false });
  assert.equal(execution.takeoverStatus(), "agent");
});

function before(hooks: ManagedTaskPolicyHooks, name: string, id: string, args: Record<string, unknown> = {}) {
  const toolCall = { type: "toolCall" as const, name, id, arguments: args };
  return hooks.beforeToolCall({ toolCall, args, assistantMessage: { content: [toolCall] } as never, context: {} as never });
}
function after(hooks: ManagedTaskPolicyHooks, name: string, id: string, details: unknown) {
  return hooks.afterToolCall({ toolCall: { type: "toolCall", name, id, arguments: {} }, args: {}, assistantMessage: {} as never, context: {} as never, result: { content: [], details }, isError: false });
}

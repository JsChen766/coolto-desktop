import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ManagedTaskPolicyHooks } from "../src/agent-task/managed-task-policy-hooks.js";
import type {
  BrowserAgentController,
  BrowserAgentTab,
} from "../src/browser/agent-control-types.js";
import { applyToolCapabilities } from "../src/tools/tool-capabilities.js";

async function setup() {
  const ownerId = "owner-control-receipts";
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await services.tasks.create("conversation-control", "Navigate jobs");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.control"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "bsf3",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  let tabs = [tab("tab-1", "https://jobs.example/start", true)];
  const browser = {
    getActiveTab: () => tabs.find((value) => value.isActive) ?? null,
    listTabs: () => tabs,
  } as BrowserAgentController;
  const tools = applyToolCapabilities([
    "browser_navigate", "browser_new_tab", "browser_close_tab",
  ].map((name) => ({
    name, label: name, description: "", parameters: {} as never,
    execute: async () => ({ content: [], details: {} }),
  })));
  const hooks = new ManagedTaskPolicyHooks({
    conversationId: task.conversationId, services, browser, tools,
    sitePolicyAllows: () => true,
  });
  return { services, task, hooks, setTabs: (value: BrowserAgentTab[]) => { tabs = value; } };
}

function tab(id: string, url: string, isActive: boolean): BrowserAgentTab {
  return {
    id, url, isActive, title: id, isLoading: false,
    canGoBack: false, canGoForward: false,
  };
}

function before(
  hooks: ManagedTaskPolicyHooks,
  name: string,
  id: string,
  args: Record<string, unknown>,
) {
  const toolCall = { type: "toolCall" as const, name, id, arguments: args };
  return hooks.beforeToolCall({
    toolCall, args, assistantMessage: { content: [toolCall] } as never,
    context: {} as never,
  });
}

function after(
  hooks: ManagedTaskPolicyHooks,
  name: string,
  id: string,
  args: Record<string, unknown>,
) {
  return hooks.afterToolCall({
    toolCall: { type: "toolCall", name, id, arguments: args },
    args, assistantMessage: {} as never, context: {} as never,
    result: { content: [], details: {} }, isError: false,
  });
}

test("navigate receipts bind the actual redirect origin", async () => {
  const value = await setup();
  const args = { url: "https://jobs.example/next" };
  assert.equal(await before(value.hooks, "browser_navigate", "navigate", args), undefined);
  value.setTabs([tab("tab-1", "https://redirect.example/landing", true)]);
  await after(value.hooks, "browser_navigate", "navigate", args);
  const receipt = (await value.services.ledger.listReceipts(value.task.id)).at(-1);
  assert.equal(receipt?.status, "blocked");
  assert.equal(receipt?.targetOrigin, "https://redirect.example");
});

test("new-tab and close-tab receipts preserve their distinct tab semantics", async (t) => {
  await t.test("new tab validates actual origin without requiring its future id", async () => {
    const value = await setup();
    const args = { url: "https://jobs.example/new" };
    assert.equal(await before(value.hooks, "browser_new_tab", "new-tab", args), undefined);
    value.setTabs([tab("generated-tab", "https://jobs.example/new", true)]);
    await after(value.hooks, "browser_new_tab", "new-tab", args);
    assert.equal((await value.services.ledger.listReceipts(value.task.id)).at(-1)?.status,
      "succeeded");
  });

  await t.test("close tab keeps the authorized target after active tab changes", async () => {
    const value = await setup();
    const args = { tabId: "tab-1" };
    assert.equal(await before(value.hooks, "browser_close_tab", "close-tab", args), undefined);
    value.setTabs([tab("tab-2", "https://other.example/home", true)]);
    await after(value.hooks, "browser_close_tab", "close-tab", args);
    assert.equal((await value.services.ledger.listReceipts(value.task.id)).at(-1)?.status,
      "succeeded");
  });
});

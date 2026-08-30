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
  const ownerId = "owner-read-surface";
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await services.tasks.create("conversation-read", "Inspect job tabs");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.read"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "bsf3",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  let tabs: BrowserAgentTab[] = [
    tab("allowed", "https://jobs.example/role", true),
    tab("private", "https://private.example/account", false),
  ];
  const browser = {
    listTabs: () => tabs,
    getActiveTab: () => tabs.find((value) => value.isActive) ?? null,
  } as BrowserAgentController;
  const tools = applyToolCapabilities([
    "browser_list_tabs", "browser_get_active_tab",
    "browser_snapshot", "browser_query_elements",
  ].map((name) => ({
    name, label: name, description: "", parameters: {} as never,
    execute: async () => ({ content: [], details: {} }),
  })));
  const hooks = new ManagedTaskPolicyHooks({
    conversationId: task.conversationId, services, browser, tools,
    sitePolicyAllows: (origin, toolName) =>
      ["browser_list_tabs", "browser_get_active_tab"].includes(toolName) ||
      Boolean(origin?.startsWith("https://")),
  });
  return {
    hooks, services, task,
    setTabs: (value: BrowserAgentTab[]) => { tabs = value; },
  };
}

function tab(id: string, url: string | null, isActive: boolean): BrowserAgentTab {
  return {
    id, url, isActive, title: id, isLoading: false,
    canGoBack: false, canGoForward: false,
  };
}

function before(hooks: ManagedTaskPolicyHooks, name: string, id = name) {
  const toolCall = { type: "toolCall" as const, name, id, arguments: {} };
  return hooks.beforeToolCall({
    toolCall, args: {}, assistantMessage: { content: [toolCall] } as never,
    context: {} as never,
  });
}

test("list tabs blocks the whole read when any returned tab origin is unauthorized", async () => {
  const value = await setup();
  await value.services.tasks.setHostStatus(value.task.id, "paused");
  await value.services.tasks.startRun({ taskId: value.task.id, wakeCause: "user" });
  const blocked = await before(value.hooks, "browser_list_tabs");
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /domain_not_allowed/u);
  assert.doesNotMatch(blocked?.reason ?? "", /private\.example/u);

  value.setTabs([tab("allowed", "https://jobs.example/role", true)]);
  assert.equal(await before(value.hooks, "browser_list_tabs", "list-allowed"), undefined);
});

test("active-tab metadata fails closed when its origin cannot be authorized", async () => {
  const value = await setup();
  value.setTabs([tab("unknown", null, true)]);
  const blocked = await before(value.hooks, "browser_get_active_tab");
  assert.equal(blocked?.block, true);
  assert.match(blocked?.reason ?? "", /site_policy_blocked/u);

  value.setTabs([]);
  assert.equal(await before(value.hooks, "browser_get_active_tab", "active-empty"), undefined);
});

test("snapshot and element query remain bound to the active origin", async () => {
  const value = await setup();
  value.setTabs([tab("private", "https://private.example/account", true)]);
  for (const name of ["browser_snapshot", "browser_query_elements"]) {
    assert.match((await before(value.hooks, name, name))?.reason ?? "",
      /domain_not_allowed/u);
  }
  value.setTabs([tab("allowed", "https://jobs.example/role", true)]);
  assert.equal(await before(value.hooks, "browser_snapshot", "snapshot-allowed"), undefined);
  assert.equal(await before(value.hooks, "browser_query_elements", "query-allowed"), undefined);
});

import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ManagedTaskPolicyHooks } from "../src/agent-task/managed-task-policy-hooks.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import { applyToolCapabilities } from "../src/tools/tool-capabilities.js";

async function setup(mode: "inactive" | "throw") {
  const ownerId = `owner-policy-${mode}`;
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await services.tasks.create(`conversation-${mode}`, "Inspect role");
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.read", "browser.write"],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "bsf3",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const tab = {
    id: "tab-policy", title: "Jobs", url: "https://jobs.example/apply",
    isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
  };
  const browser = { getActiveTab: () => tab } as BrowserAgentController;
  const tools = applyToolCapabilities([
    { name: "browser_snapshot", label: "snapshot", description: "",
      parameters: {} as never, execute: async () => ({ content: [], details: {} }) },
    { name: "browser_fill_field", label: "fill", description: "",
      parameters: {} as never, execute: async () => ({ content: [], details: {} }) },
  ]);
  let access = false;
  let revocations = 0;
  const hooks = new ManagedTaskPolicyHooks({
    conversationId: task.conversationId, services, browser, tools,
    sitePolicyAllows: () => true,
    grantBrowserAccess: () => {
      access = true;
      if (mode === "inactive") void services.tasks.setHostStatus(task.id, "paused");
      if (mode === "throw") throw new Error("gate failed after partial grant");
    },
    revokeBrowserAccess: () => {
      access = false;
      revocations += 1;
    },
  });
  return { services, task, hooks, tab, access: () => access, revocations: () => revocations };
}

function before(
  hooks: ManagedTaskPolicyHooks,
  name: string,
  id: string,
  args: Record<string, unknown> = {},
) {
  const toolCall = { type: "toolCall" as const, name, id, arguments: args };
  return hooks.beforeToolCall({
    toolCall, args, assistantMessage: { content: [toolCall] } as never,
    context: {} as never,
  });
}

async function observe(value: Awaited<ReturnType<typeof setup>>) {
  assert.equal(await before(value.hooks, "browser_snapshot", "snapshot-race"), undefined);
  await value.hooks.afterToolCall({
    toolCall: { type: "toolCall", name: "browser_snapshot", id: "snapshot-race",
      arguments: {} },
    args: {}, assistantMessage: {} as never, context: {} as never,
    result: { content: [], details: { tab: value.tab, page: { text: "role" } } },
    isError: false,
  });
}

test("inactive and failed access preflights persist one block and no ghost allow", async (t) => {
  for (const mode of ["inactive", "throw"] as const) {
    await t.test(mode, async () => {
      const value = await setup(mode);
      await observe(value);
      const result = await before(value.hooks, "browser_fill_field", "fill-race");
      assert.equal(result?.block, true);
      assert.equal(value.access(), false);
      assert.equal(value.revocations(), 1);
      const decisions = (await value.services.policyDecisions.list(value.task.id))
        .filter((decision) => decision.toolCallId === "fill-race");
      assert.equal(decisions.length, 1);
      assert.equal(decisions[0]?.decision, "block");
      assert.equal(new Set(decisions.map((value) =>
        `${value.runId}:${value.toolCallId}`)).size, 1);
    });
  }
});

test("select and close preflight authorize the requested tab origin", async () => {
  const ownerId = "owner-tab-target";
  const services = new AgentHarnessServices(
    ownerId,
    new AgentHarnessStateRepository(ownerId, new MemoryAgentHarnessStatePersistence()),
  );
  const task = await services.tasks.create("conversation-tabs", "Inspect tabs");
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
  const active = { id: "allowed", title: "Allowed", url: "https://jobs.example",
    isActive: true, isLoading: false, canGoBack: false, canGoForward: false };
  const blocked = { ...active, id: "blocked", title: "Blocked",
    url: "https://other.example", isActive: false };
  const browser = {
    getActiveTab: () => active,
    listTabs: () => [active, blocked],
  } as BrowserAgentController;
  const tools = applyToolCapabilities(["browser_select_tab", "browser_close_tab"]
    .map((name) => ({
      name, label: name, description: "", parameters: {} as never,
      execute: async () => ({ content: [], details: {} }),
    })));
  const hooks = new ManagedTaskPolicyHooks({
    conversationId: task.conversationId, services, browser, tools,
    sitePolicyAllows: () => true,
  });
  for (const name of ["browser_select_tab", "browser_close_tab"]) {
    assert.match(
      (await before(hooks, name, name, { tabId: "blocked" }))?.reason ?? "",
      /domain_not_allowed/u,
    );
  }
  assert.deepEqual(
    (await services.ledger.listReceipts(task.id)).map((value) => value.targetOrigin),
    ["https://other.example", "https://other.example"],
  );
});

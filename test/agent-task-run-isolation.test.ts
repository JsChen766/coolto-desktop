import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import { AgentTaskRunner } from "../src/agent-task/agent-task-runner.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import { ManagedTaskPolicyHooks } from "../src/agent-task/managed-task-policy-hooks.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import { applyToolCapabilities } from "../src/tools/tool-capabilities.js";

const OWNER_ID = "owner-safety";

async function setup() {
  const repository = new AgentHarnessStateRepository(
    OWNER_ID,
    new MemoryAgentHarnessStatePersistence(),
  );
  const services = new AgentHarnessServices(OWNER_ID, repository);
  const task = await services.tasks.create("conversation-safety", "Inspect a role");
  const now = Date.now();
  await services.grants.create({
    ownerId: OWNER_ID, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: [
      "browser.read", "browser.write", "browser.control", "task.lifecycle",
    ],
    jobCriteria: {}, assetPolicy: {}, answerPolicy: {}, submissionBudget: {},
    unattended: true, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "bsf3",
    confirmedByUserAt: new Date(now).toISOString(),
  });
  const firstRun = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  let url = "https://jobs.example/apply";
  let accessGranted = false;
  const browser = {
    getActiveTab: () => ({
      id: "tab-1", title: "Jobs", url, isActive: true, isLoading: false,
      canGoBack: false, canGoForward: false,
    }),
  } as BrowserAgentController;
  const tools = applyToolCapabilities([
    { name: "browser_snapshot", label: "snapshot", description: "",
      parameters: {} as never, execute: async () => ({ content: [], details: {} }) },
    { name: "browser_fill_field", label: "fill", description: "",
      parameters: {} as never, execute: async () => ({ content: [], details: {} }) },
    { name: "browser_reload", label: "reload", description: "",
      parameters: {} as never, execute: async () => ({ content: [], details: {} }) },
  ]);
  const hooks = new ManagedTaskPolicyHooks({
    conversationId: task.conversationId, services, browser, tools,
    sitePolicyAllows: () => true,
    grantBrowserAccess: () => { accessGranted = true; },
    revokeBrowserAccess: () => { accessGranted = false; },
  });
  const revoked: string[] = [];
  const runner = new AgentTaskRunner(services, {
    prompt: async () => undefined,
    cancel: () => undefined,
    revokeBrowserAccess: (reason) => {
      accessGranted = false;
      revoked.push(reason);
    },
  });
  return {
    services, task, firstRun, hooks, runner, browser,
    setUrl: (value: string) => { url = value; },
    accessGranted: () => accessGranted,
    revoked,
  };
}

function before(hooks: ManagedTaskPolicyHooks, name: string, id: string) {
  const toolCall = { type: "toolCall" as const, name, id, arguments: {} };
  return hooks.beforeToolCall({
    toolCall, args: {}, assistantMessage: { content: [toolCall] } as never,
    context: {} as never,
  });
}

function after(
  hooks: ManagedTaskPolicyHooks,
  name: string,
  id: string,
  details: unknown,
) {
  return hooks.afterToolCall({
    toolCall: { type: "toolCall", name, id, arguments: {} },
    args: {}, assistantMessage: {} as never, context: {} as never,
    result: { content: [], details }, isError: false,
  });
}

async function observe(value: Awaited<ReturnType<typeof setup>>, id: string) {
  assert.equal(await before(value.hooks, "browser_snapshot", id), undefined);
  await after(value.hooks, "browser_snapshot", id, {
    tab: value.browser.getActiveTab(), page: { text: "role" },
  });
}

test("a late snapshot from a paused run cannot authorize its resumed run", async () => {
  const value = await setup();
  assert.equal(await before(value.hooks, "browser_snapshot", "snapshot-old"), undefined);
  assert.ok(value.services.runtimeProjection.current(value.task.id, value.firstRun.id));
  await value.runner.pause(value.task.id);
  assert.equal(value.services.runtimeProjection.current(value.task.id, value.firstRun.id), null);
  const secondRun = await value.services.tasks.startRun({
    taskId: value.task.id, wakeCause: "user",
  });
  await after(value.hooks, "browser_snapshot", "snapshot-old", {
    tab: value.browser.getActiveTab(), page: { text: "stale role" },
  });
  assert.notEqual(secondRun.id, value.firstRun.id);
  assert.match(
    (await before(value.hooks, "browser_fill_field", "fill-new"))?.reason ?? "",
    /fresh_observation/u,
  );
});

test("takeover pause and stop invalidate pending write tokens", async (t) => {
  for (const transition of ["pause", "cancel"] as const) {
    await t.test(transition, async () => {
      const value = await setup();
      await observe(value, `snapshot-${transition}`);
      assert.equal(await before(value.hooks, "browser_fill_field", `fill-${transition}`), undefined);
      assert.equal(value.accessGranted(), true);
      assert.ok(value.services.runtimeProjection.current(value.task.id, value.firstRun.id));
      await value.runner[transition](value.task.id);
      assert.equal(value.accessGranted(), false);
      assert.equal(
        value.services.runtimeProjection.current(value.task.id, value.firstRun.id),
        null,
      );
      await after(value.hooks, "browser_fill_field", `fill-${transition}`, { changed: true });
      const receipts = await value.services.ledger.listReceipts(value.task.id);
      assert.notEqual(receipts.at(-1)?.status, "succeeded");
    });
  }
});

test("origin drift blocks both a pending receipt and observation reuse", async () => {
  const value = await setup();
  await observe(value, "snapshot-origin");
  assert.equal(await before(value.hooks, "browser_fill_field", "fill-origin"), undefined);
  value.setUrl("https://other.example/apply");
  await after(value.hooks, "browser_fill_field", "fill-origin", { changed: true });
  const receipts = await value.services.ledger.listReceipts(value.task.id);
  assert.equal(receipts.at(-1)?.status, "blocked");
  assert.match(
    (await before(value.hooks, "browser_fill_field", "fill-after-origin"))?.reason ?? "",
    /fresh_observation|domain_not_allowed/u,
  );
});

test("origin drift also blocks a fresh-observation-free browser control", async () => {
  const value = await setup();
  assert.equal(await before(value.hooks, "browser_reload", "reload-origin"), undefined);
  value.setUrl("https://other.example/drifted");
  await after(value.hooks, "browser_reload", "reload-origin", { reloaded: true });
  const receipts = await value.services.ledger.listReceipts(value.task.id);
  assert.equal(receipts.at(-1)?.status, "blocked");
});

test("a canceled runtime rejection cannot overwrite pause or stop", async (t) => {
  for (const transition of ["pause", "cancel"] as const) {
    await t.test(transition, async () => {
      const value = await setup();
      await value.runner.pause(value.task.id);
      let rejectPrompt!: (error: Error) => void;
      let markStarted!: () => void;
      const started = new Promise<void>((resolve) => { markStarted = resolve; });
      const prompt = new Promise<void>((_resolve, reject) => { rejectPrompt = reject; });
      const runner = new AgentTaskRunner(value.services, {
        prompt: async () => {
          markStarted();
          await prompt;
        },
        cancel: () => undefined,
        revokeBrowserAccess: () => undefined,
      });
      const running = runner.start(value.task.id);
      await started;
      const expected = await runner[transition](value.task.id);
      rejectPrompt(new Error("runtime aborted after host transition"));
      assert.equal((await running).status, expected.status);
      assert.equal((await value.services.tasks.get(value.task.id)).status, expected.status);
    });
  }
});

test("an active run runtime failure still becomes failed and rejects", async () => {
  const value = await setup();
  await value.runner.pause(value.task.id);
  const runner = new AgentTaskRunner(value.services, {
    prompt: async () => { throw new Error("real runtime failure"); },
    cancel: () => undefined,
    revokeBrowserAccess: () => undefined,
  });
  await assert.rejects(runner.start(value.task.id), /real runtime failure/u);
  assert.equal((await value.services.tasks.get(value.task.id)).status, "failed");
});

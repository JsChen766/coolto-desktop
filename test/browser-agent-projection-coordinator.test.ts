import assert from "node:assert/strict";
import test from "node:test";

import { AgentHarnessServices } from "../src/agent-task/agent-harness-services.js";
import {
  AgentHarnessStateRepository,
  MemoryAgentHarnessStatePersistence,
} from "../src/agent-task/agent-harness-state-repository.js";
import type { BrowserAgentController } from "../src/browser/agent-control-types.js";
import type { BrowserPageOperator } from "../src/browser/types.js";
import {
  BrowserAgentProjectionCoordinator,
  type BrowserAgentProjectionReader,
} from "../src/desktop/main/agent-task/browser-agent-projection-coordinator.js";
import { readBrowserAgentProjectionFacts } from
  "../src/desktop/main/agent-task/browser-agent-projection-reader.js";
import { BrowserAgentStatusBridge } from
  "../src/desktop/main/browser/browser-agent-status-bridge.js";

test("repository invalidation refreshes and retains a terminal projection without fake targets", async () => {
  const services = createServices("owner-a");
  const task = await services.tasks.create("conversation-a", "Owner A task");
  await grantBrowserTask(services, task, "owner-a");
  const status = new BrowserAgentStatusBridge();
  const coordinator = new BrowserAgentProjectionCoordinator(
    services, status, browserWithActiveTab(), pageAccess(true),
  );
  status.bindSource(() => coordinator.dispose());
  await coordinator.initialize();
  assert.equal(status.get()?.phase, "queued");
  assert.equal(status.get()?.targetTabId, null);
  assert.equal(status.get()?.targetOrigin, null);
  assert.equal(status.get()?.currentAction, null);

  const run = await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  services.runtimeProjection.start({
    callId: "call-browser", runId: run.id, taskId: task.id,
    toolName: "browser_snapshot", tabId: "target-tab",
    targetOrigin: "https://jobs.example", startedAt: new Date().toISOString(),
  });
  await waitFor(() => status.get()?.phase === "acting");
  assert.equal(status.get()?.targetTabId, "target-tab");
  await services.grants.revoke(task.id, "user");
  await waitFor(() => status.get()?.phase === "revoked");
  assert.equal(status.get()?.targetTabId, null);
  services.runtimeProjection.finish("call-browser");
  await waitFor(() => status.get()?.phase === "revoked");
  assert.equal(status.get()?.targetTabId, null);

  await services.tasks.setHostStatus(task.id, "paused");
  await waitFor(() => status.get()?.phase === "revoked");
  await services.tasks.setHostStatus(task.id, "canceled");
  await waitFor(() => status.get()?.phase === "stopped");
  await services.events.enqueue({
    taskId: task.id, source: "system", type: "system.after_terminal",
    trust: "trusted_system", occurredAt: new Date().toISOString(),
    dedupeKey: "after-terminal", payloadRef: null, payloadHash: "hash",
  });
  await waitFor(() => status.get()?.recentActivity.length === 1);
  assert.equal(status.get()?.phase, "stopped");
  status.clear();
});

test("a delayed old-owner refresh cannot overwrite the newly bound owner", async () => {
  const servicesA = createServices("owner-a");
  const servicesB = createServices("owner-b");
  const taskA = await servicesA.tasks.create("conversation-a", "Owner A task");
  const taskB = await servicesB.tasks.create("conversation-b", "Owner B task");
  await grantBrowserTask(servicesA, taskA, "owner-a");
  await grantBrowserTask(servicesB, taskB, "owner-b");
  const status = new BrowserAgentStatusBridge();
  let release!: () => void;
  let entered!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const slowReader: BrowserAgentProjectionReader = async (...args) => {
    entered();
    await blocked;
    return readBrowserAgentProjectionFacts(...args);
  };
  const oldCoordinator = new BrowserAgentProjectionCoordinator(
    servicesA, status, browserWithActiveTab(), pageAccess(false), slowReader,
  );
  status.bindSource(() => oldCoordinator.dispose());
  const oldRefresh = oldCoordinator.taskChanged(taskA);
  await started;

  const newCoordinator = new BrowserAgentProjectionCoordinator(
    servicesB, status, browserWithActiveTab(), pageAccess(false),
  );
  status.bindSource(() => newCoordinator.dispose());
  await newCoordinator.taskChanged(taskB);
  assert.equal(status.get()?.goal, "Owner B task");
  release();
  await oldRefresh;
  assert.equal(status.get()?.goal, "Owner B task");
  assert.equal(status.taskId(), taskB.id);
  status.clear();
});

test("runtime facts are injectable and projection read failures stay non-blocking", async () => {
  const services = createServices("owner-runtime");
  const task = await services.tasks.create("conversation-runtime", "Runtime task");
  await grantBrowserTask(services, task, "owner-runtime");
  const status = new BrowserAgentStatusBridge();
  let actionVisible = true;
  const coordinator = new BrowserAgentProjectionCoordinator(
    services, status, browserWithActiveTab(), pageAccess(false),
    readBrowserAgentProjectionFacts,
    () => ({
      control: "agent",
      currentAction: actionVisible ? {
        kind: "observe", impact: "read", targetOrigin: "https://target.example/path",
        targetTabId: "real-target-tab", startedAt: "2026-08-30T12:00:00.000Z",
      } : null,
      modelActive: false, pageAccess: null, review: null,
    }),
  );
  status.bindSource(() => coordinator.dispose());
  await coordinator.taskChanged(task);
  assert.equal(status.get()?.targetTabId, "real-target-tab");
  assert.equal(status.get()?.targetOrigin, "https://target.example");
  actionVisible = false;
  coordinator.runtimeChanged();
  await waitFor(() => status.get()?.targetTabId === null);
  status.clear();

  const brokenStatus = new BrowserAgentStatusBridge();
  const broken = new BrowserAgentProjectionCoordinator(
    services, brokenStatus, browserWithActiveTab(), pageAccess(false),
    async () => { throw new Error("projection read secret"); },
  );
  brokenStatus.bindSource(() => broken.dispose());
  await assert.doesNotReject(() => broken.taskChanged(task));
  assert.equal(brokenStatus.get(), null);
  brokenStatus.clear();
});

test("Browser Chrome ignores a newer task without Browser delegation", async () => {
  const services = createServices("owner-scope");
  const browserTask = await services.tasks.create("browser-conversation", "Browser task");
  await grantBrowserTask(services, browserTask, "owner-scope");
  await new Promise((resolve) => setTimeout(resolve, 2));
  const otherTask = await services.tasks.create("other-conversation", "Non-browser task");
  const status = new BrowserAgentStatusBridge();
  const coordinator = new BrowserAgentProjectionCoordinator(
    services, status, browserWithActiveTab(), pageAccess(false),
  );
  status.bindSource(() => coordinator.dispose());
  await coordinator.initialize();
  assert.equal(status.get()?.goal, "Browser task");
  await coordinator.taskChanged(otherTask);
  assert.equal(status.get(), null);
  status.clear();
});

test("page access changes refresh reviewing state without repository polling", async () => {
  const services = createServices("owner-page-state");
  const task = await services.tasks.create("conversation-page", "Review page changes");
  await grantBrowserTask(services, task, "owner-page-state");
  await services.tasks.startRun({ taskId: task.id, wakeCause: "user" });
  const page = reactivePageAccess();
  const status = new BrowserAgentStatusBridge();
  const coordinator = new BrowserAgentProjectionCoordinator(
    services, status, browserWithActiveTab(), page.operator,
  );
  status.bindSource(() => coordinator.dispose());
  await coordinator.initialize();
  assert.equal(status.get()?.phase, "planning");
  page.setReviewing(true);
  await waitFor(() => status.get()?.phase === "reviewing");
  assert.equal(status.get()?.review?.total, 1);
  status.clear();
});

function createServices(ownerId: string): AgentHarnessServices {
  return new AgentHarnessServices(ownerId, new AgentHarnessStateRepository(
    ownerId, new MemoryAgentHarnessStatePersistence(),
  ));
}

async function grantBrowserTask(
  services: AgentHarnessServices,
  task: Awaited<ReturnType<AgentHarnessServices["tasks"]["create"]>>,
  ownerId: string,
): Promise<void> {
  const now = Date.now();
  await services.grants.create({
    ownerId, taskId: task.id, taskGoalHash: task.goalHash,
    allowedDomains: ["jobs.example"], blockedDomains: [],
    allowedActions: ["browser.read"], jobCriteria: {}, assetPolicy: {},
    answerPolicy: {}, submissionBudget: { minimumMatch: 0, dailyLimit: null },
    unattended: false, validFrom: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(), policyVersion: "bsf3-test",
    confirmedByUserAt: new Date(now).toISOString(),
  });
}

function browserWithActiveTab(): BrowserAgentController {
  return { getActiveTab: () => ({
    id: "active-user-tab", title: "Active", url: "https://active.example/path",
    isActive: true, isLoading: false, canGoBack: false, canGoForward: false,
  }) } as BrowserAgentController;
}

function pageAccess(granted: boolean): BrowserPageOperator {
  return {
    isReviewing: () => false,
    isWriteAccessGranted: () => granted,
    checkWriteAccess: () => granted ? { ok: true } : { ok: false, message: "read only" },
    getFillLog: () => [],
    subscribeState: () => () => undefined,
  } as unknown as BrowserPageOperator;
}

function reactivePageAccess(): {
  operator: BrowserPageOperator;
  setReviewing(value: boolean): void;
} {
  let listener: () => void = () => undefined;
  let reviewing = false;
  return {
    operator: {
      isReviewing: () => reviewing,
      isWriteAccessGranted: () => true,
      checkWriteAccess: () => ({ ok: true }),
      getFillLog: () => reviewing ? [{ fillId: "field", label: "Name" }] : [],
      subscribeState: (next: () => void) => {
        listener = next;
        return () => undefined;
      },
    } as unknown as BrowserPageOperator,
    setReviewing: (value) => { reviewing = value; listener(); },
  };
}

async function waitFor(check: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("projection refresh timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

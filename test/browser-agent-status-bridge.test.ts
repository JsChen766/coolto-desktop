import assert from "node:assert/strict";
import test from "node:test";

import { projectBrowserAgentChrome } from "../src/browser/browser-agent-projection.js";
import type { AgentTaskStatus } from "../src/agent-task/task-types.js";
import type { BrowserAgentProjectionFacts } from "../src/desktop/shared/types/browser-agent.js";
import { BrowserAgentStatusBridge } from
  "../src/desktop/main/browser/browser-agent-status-bridge.js";

test("binding a new source disposes and clears the previous owner projection", () => {
  const bridge = new BrowserAgentStatusBridge();
  let disposed = false;
  bridge.bindSource(() => { disposed = true; });
  bridge.setProjection({ conversationId: "conversation-a", state: view("Owner A", "running"),
    taskId: "task-a" });

  bridge.bindSource(() => {});
  assert.equal(disposed, true);
  assert.equal(bridge.get(), null);
  assert.equal(bridge.taskId(), null);
  assert.equal(bridge.conversationId(), null);
});

test("command transient state keeps refreshed capabilities and never exposes raw errors", async () => {
  const bridge = new BrowserAgentStatusBridge();
  bridge.bindSource(() => {});
  bridge.setProjection({ conversationId: "conversation", state: view("Running", "running"),
    taskId: "task" });
  let rejectCommand!: (error: Error) => void;
  bridge.onCommand(() => new Promise<void>((_resolve, reject) => {
    rejectCommand = reject;
  }));

  const command = bridge.command("pause");
  assert.equal(bridge.get()?.commandPending, true);
  bridge.setProjection({ conversationId: "conversation", state: view("Paused", "paused"),
    taskId: "task" });
  assert.equal(bridge.get()?.commands.resume, true);
  assert.equal(bridge.get()?.commandPending, true);

  rejectCommand(new Error("raw secret from runner"));
  await assert.rejects(command, /raw secret/u);
  const state = bridge.get()!;
  assert.equal(state.commandPending, false);
  assert.equal(state.commandError, "任务操作失败，请重试");
  assert.equal(state.commands.resume, true);
  assert.doesNotMatch(JSON.stringify(state), /raw secret/u);
});

test("an old-owner command result cannot mutate the newly bound source", async () => {
  const bridge = new BrowserAgentStatusBridge();
  bridge.bindSource(() => {});
  bridge.setProjection({ conversationId: "old", state: view("Old owner", "running"),
    taskId: "old-task" });
  let rejectOld!: (error: Error) => void;
  bridge.onCommand(() => new Promise<void>((_resolve, reject) => { rejectOld = reject; }));
  const oldCommand = bridge.command("pause");
  assert.equal(bridge.get()?.commandPending, true);

  bridge.bindSource(() => {});
  bridge.setProjection({ conversationId: "new", state: view("New owner", "running"),
    taskId: "new-task" });
  rejectOld(new Error("old owner secret"));
  await assert.rejects(oldCommand, /old owner secret/u);
  assert.equal(bridge.get()?.goal, "New owner");
  assert.equal(bridge.get()?.commandPending, false);
  assert.equal(bridge.get()?.commandError, null);
});

function view(goal: string, status: AgentTaskStatus) {
  const facts: BrowserAgentProjectionFacts = {
    task: { goal, status, waitingReason: null, updatedAt: "2026-08-30T12:00:00.000Z" },
    control: "agent", modelActive: false, currentAction: null,
    delegation: {
      domains: ["jobs.example"], capabilities: ["read"], unattended: false,
      expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: null,
    },
    pageAccess: null, review: null, activity: [], commandError: null,
    commandPending: false,
  };
  return projectBrowserAgentChrome(facts, Date.parse("2026-08-30T12:00:00.000Z"))!;
}

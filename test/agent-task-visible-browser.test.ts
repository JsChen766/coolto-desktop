import assert from "node:assert/strict";
import test from "node:test";

import type { AgentTaskDetailView, BrowserState } from
  "../src/desktop/shared/types.js";
import { runAgentTaskAction } from
  "../src/desktop/main/agent-task/agent-task-ipc.js";

const openState: BrowserState = {
  isOpen: true,
  currentUrl: null,
  pageTitle: null,
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  pageType: "unknown",
  fillStatus: "idle",
};

test("browser AgentTask opens the visible Browser before its run", async () => {
  const calls: string[] = [];
  await runAgentTaskAction(
    "start",
    detail(["browser.read", "browser.control", "mail.read"]),
    async () => {
      calls.push("browser.open");
      return openState;
    },
    async () => { calls.push("agent.start"); },
  );
  assert.deepEqual(calls, ["browser.open", "agent.start"]);
});

test("non-browser AgentTask starts without opening the Browser", async () => {
  const calls: string[] = [];
  await runAgentTaskAction(
    "start",
    detail(["mail.read", "mail.classify"]),
    async () => {
      calls.push("browser.open");
      return openState;
    },
    async () => { calls.push("agent.start"); },
  );
  assert.deepEqual(calls, ["agent.start"]);
});

test("browser AgentTask does not start when the visible Browser fails", async () => {
  let started = false;
  await assert.rejects(
    runAgentTaskAction(
      "resume",
      detail(["browser.read"]),
      async () => ({ ...openState, isOpen: false }),
      async () => { started = true; },
    ),
    /可见浏览器未能打开/u,
  );
  assert.equal(started, false);
});

function detail(
  allowedActions: string[],
): Pick<AgentTaskDetailView, "grant"> {
  return {
    grant: {
      id: "grant-1",
      allowedDomains: ["outlook.live.com"],
      blockedDomains: [],
      allowedActions,
      unattended: false,
      expiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: null,
    },
  };
}

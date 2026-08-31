import assert from "node:assert/strict";
import test from "node:test";

import { deriveBrowserAgentCommands } from
  "../src/browser/browser-agent-command-policy.js";
import type { BrowserAgentProjectionFacts } from
  "../src/desktop/shared/types/browser-agent.js";

test("Browser Agent command policy follows truthful lifecycle states", () => {
  assert.deepEqual(commands(facts()), enabled("pause", "takeover", "stop"));
  assert.deepEqual(commands(facts({
    review: { total: 2, decided: 0 },
    pageAccess: { mode: "reviewing", origin: null, targetTabId: null },
  })), enabled("pause", "stop"));
  assert.deepEqual(commands(facts({ task: task("paused") })),
    enabled("resume", "stop"));
  assert.deepEqual(commands(facts({ task: task("waiting", "approval") })),
    enabled("stop"));
  assert.deepEqual(commands(facts({ task: task("waiting", "timer") })),
    enabled("resume", "stop"));
  assert.deepEqual(commands(facts({
    control: "user", task: task("paused", "takeover"),
  })), enabled("resume", "stop"));
});

test("revoked expired terminal and pending states expose no unsafe command", () => {
  const none = enabled();
  assert.deepEqual(commands(facts(), "revoked"), none);
  assert.deepEqual(commands(facts(), "expired"), none);
  assert.deepEqual(commands(facts({ task: task("completed") })), none);
  assert.deepEqual(commands(facts({ task: task("canceled") })), none);
  assert.deepEqual(commands(facts(), "active", true), none);
});

function commands(
  value: BrowserAgentProjectionFacts,
  grant: "active" | "expired" | "revoked" | null = "active",
  pending = false,
) {
  return deriveBrowserAgentCommands(value, grant, pending);
}

function enabled(...values: Array<"pause" | "resume" | "takeover" | "stop">) {
  return {
    pause: values.includes("pause"), resume: values.includes("resume"),
    takeover: values.includes("takeover"), stop: values.includes("stop"),
    openTask: true as const,
  };
}

function facts(changes: Partial<BrowserAgentProjectionFacts> = {}): BrowserAgentProjectionFacts {
  return {
    task: task("running"), control: "agent", modelActive: true,
    currentAction: null, delegation: null,
    pageAccess: { mode: "read_only", origin: null, targetTabId: null },
    review: null, activity: [], commandError: null, commandPending: false,
    ...changes,
  };
}

function task(
  status: BrowserAgentProjectionFacts["task"]["status"],
  waitingReason: BrowserAgentProjectionFacts["task"]["waitingReason"] = null,
) {
  return { goal: "Task", status, waitingReason, updatedAt: new Date().toISOString() };
}

import assert from "node:assert/strict";
import test from "node:test";

import { projectBrowserAgentChrome } from "../src/browser/browser-agent-projection.js";
import type { BrowserAgentProjectionFacts } from "../src/desktop/shared/types/browser-agent.js";

const NOW = Date.parse("2026-08-30T12:00:00.000Z");

test("projector derives an acting Chrome view and limits safe grant/activity details", () => {
  const view = projectBrowserAgentChrome(facts({
    currentAction: {
      kind: "fill", impact: "page_change", targetOrigin: "https://jobs.example/apply?q=1",
      targetTabId: "tab-public-2", startedAt: "2026-08-30T11:59:00.000Z",
    },
    delegation: {
      domains: ["jobs.example", "careers.example", "work.example", "fourth.example"],
      capabilities: ["write", "read", "write", "submit"], unattended: true,
      expiresAt: "2026-08-31T12:00:00.000Z", revokedAt: null,
    },
    activity: [
      activity("event", "task_event", null, "2026-08-30T11:55:00.000Z"),
      activity("receipt", "action_succeeded", "navigate", "2026-08-30T11:58:00.000Z"),
      activity("policy", "policy_blocked", null, "2026-08-30T11:57:00.000Z"),
      activity("receipt", "action_failed", "download", "2026-08-30T11:56:00.000Z"),
    ],
  }), NOW)!;

  assert.equal(view.phase, "acting");
  assert.equal(view.summary, "填写页面内容");
  assert.equal(view.currentAction?.targetOrigin, "https://jobs.example");
  assert.equal(view.targetTabId, "tab-public-2");
  assert.equal(view.targetOrigin, "https://jobs.example");
  assert.deepEqual(view.delegation?.domains, [
    "jobs.example", "careers.example", "work.example",
  ]);
  assert.equal(view.delegation?.moreDomainCount, 1);
  assert.deepEqual(view.delegation?.capabilities, ["read", "write", "submit"]);
  assert.equal(view.recentActivity.length, 3);
  assert.deepEqual(view.recentActivity.map((item) => item.tone), [
    "success", "warning", "danger",
  ]);
  assert.deepEqual(view.recentActivity.map((item) => item.label), [
    "页面操作已完成", "一项操作已被安全策略阻止", "页面操作失败",
  ]);
  assert.deepEqual(view.commands, {
    pause: true, resume: false, takeover: true, stop: true, openTask: true,
  });
});

test("projector uses factual phase precedence and only derives required user actions", () => {
  const reviewing = projectBrowserAgentChrome(facts({
    review: { total: 5, decided: 2 },
    pageAccess: { mode: "reviewing", origin: "https://jobs.example", targetTabId: "tab-1" },
  }), NOW)!;
  assert.equal(reviewing.phase, "reviewing");
  assert.equal(reviewing.summary, "等待你审核页面修改");
  assert.deepEqual(reviewing.review, { total: 5, decided: 2, pending: 3 });
  assert.deepEqual(reviewing.requiredUserAction, {
    kind: "review", count: 3, label: "审核页面修改",
  });
  assert.equal(reviewing.commands.takeover, false);

  const takeover = projectBrowserAgentChrome(facts({
    control: "user", task: task({ status: "paused" }),
  }), NOW)!;
  assert.equal(takeover.phase, "user_control");
  assert.equal(takeover.requiredUserAction?.kind, "return_control");

  const approval = projectBrowserAgentChrome(facts({
    task: task({ status: "waiting", waitingReason: "approval" }),
  }), NOW)!;
  assert.equal(approval.phase, "waiting");
  assert.equal(approval.requiredUserAction?.kind, "approval");
  assert.equal(approval.commands.resume, false);

  const planning = projectBrowserAgentChrome(facts(), NOW)!;
  assert.equal(planning.phase, "planning");
  assert.equal(planning.requiredUserAction, null);
  assert.equal("nextAction" in planning, false);
});

test("projector distinguishes revoked, expired and terminal states", () => {
  const revoked = projectBrowserAgentChrome(facts({
    delegation: delegation({ revokedAt: "2026-08-30T11:00:00.000Z" }),
  }), NOW)!;
  assert.equal(revoked.phase, "revoked");
  assert.deepEqual(revoked.commands, {
    pause: false, resume: false, takeover: false, stop: false, openTask: true,
  });

  const expired = projectBrowserAgentChrome(facts({
    task: task({ status: "paused" }),
    delegation: delegation({ expiresAt: "2026-08-30T11:00:00.000Z" }),
  }), NOW)!;
  assert.equal(expired.phase, "expired");

  const stopped = projectBrowserAgentChrome(facts({
    task: task({ status: "canceled" }),
  }), NOW)!;
  assert.equal(stopped.phase, "stopped");
  assert.deepEqual(stopped.commands, {
    pause: false, resume: false, takeover: false, stop: false, openTask: true,
  });
  assert.equal(projectBrowserAgentChrome(null, NOW), null);
});

test("unknown actions are generalized and extra internal runtime fields never enter the view", () => {
  const input = facts({
    commandError: "raw-command-error with task-secret",
    currentAction: {
      kind: "other", impact: "read", targetOrigin: "file:///secret",
      targetTabId: "tab-1", startedAt: "2026-08-30T11:59:00.000Z",
      toolName: "browser_fill_field", args: { secret: "private-value" },
      error: "internal-error",
    } as BrowserAgentProjectionFacts["currentAction"],
  }) as BrowserAgentProjectionFacts & {
    taskId: string; runId: string; hash: string;
  };
  input.taskId = "task-secret";
  input.runId = "run-secret";
  input.hash = "hash-secret";
  const view = projectBrowserAgentChrome(input, NOW)!;
  const serialized = JSON.stringify(view);

  assert.equal(view.currentAction?.label, "Agent 正在执行一项操作");
  assert.equal(view.currentAction?.targetOrigin, null);
  assert.equal(view.commandError, "任务操作失败，请重试");
  for (const forbidden of [
    "browser_fill_field", "private-value", "internal-error",
    "task-secret", "run-secret", "hash-secret",
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden, "u"));
});

function facts(
  changes: Partial<BrowserAgentProjectionFacts> = {},
): BrowserAgentProjectionFacts {
  return {
    task: task(), control: "agent", modelActive: true, currentAction: null,
    delegation: delegation(), pageAccess: { mode: "read_only", origin: null, targetTabId: null },
    review: null, activity: [], commandError: null, commandPending: false, ...changes,
  };
}

function task(changes: Partial<BrowserAgentProjectionFacts["task"]> = {}) {
  return {
    goal: "查找匹配岗位", status: "running" as const, waitingReason: null,
    updatedAt: "2026-08-30T11:59:30.000Z", ...changes,
  };
}

function delegation(changes: Partial<NonNullable<BrowserAgentProjectionFacts["delegation"]>> = {}) {
  return {
    domains: ["jobs.example"], capabilities: ["read" as const], unattended: false,
    expiresAt: "2026-08-31T12:00:00.000Z", revokedAt: null, ...changes,
  };
}

function activity(
  kind: "event" | "policy" | "receipt",
  code: BrowserAgentProjectionFacts["activity"][number]["code"],
  actionKind: BrowserAgentProjectionFacts["activity"][number]["actionKind"],
  occurredAt: string,
) {
  return { kind, code, actionKind, origin: "https://jobs.example/path", occurredAt };
}

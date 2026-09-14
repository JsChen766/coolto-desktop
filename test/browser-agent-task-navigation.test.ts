import assert from "node:assert/strict";
import test from "node:test";

import { nextBrowserAgentTaskNavigation, nextBrowserPageHandoffNavigation } from
  "../src/browser/browser-agent-task-navigation.js";

test("repeated Browser task deep links remain distinct and bounded", () => {
  const first = nextBrowserAgentTaskNavigation(undefined, "task-a")!;
  const second = nextBrowserAgentTaskNavigation(first, "task-a")!;
  assert.deepEqual(first, { sequence: 1, taskId: "task-a" });
  assert.deepEqual(second, { sequence: 2, taskId: "task-a" });
  assert.equal(nextBrowserAgentTaskNavigation(second, ""), null);
  assert.equal(nextBrowserAgentTaskNavigation(second, "x".repeat(129)), null);
  assert.equal(nextBrowserAgentTaskNavigation(second, "task\nsecret"), null);
});

test("repeated Browser page handoffs remain distinct and validated", () => {
  const page = { title: "Role", url: "https://jobs.example/roles/42" };
  const first = nextBrowserPageHandoffNavigation(undefined, page)!;
  const analyzed = nextBrowserPageHandoffNavigation(first, { ...page, intent: "analyze_jd" })!;
  assert.deepEqual(first, { page, sequence: 1 });
  assert.equal(analyzed.page.intent, "analyze_jd");
  assert.equal(analyzed.sequence, 2);
  assert.equal(nextBrowserPageHandoffNavigation(analyzed, null), null);
  assert.equal(nextBrowserPageHandoffNavigation(analyzed, {
    title: "Role", url: "file:///tmp/private",
  }), null);
});

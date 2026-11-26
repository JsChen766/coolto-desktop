import assert from "node:assert/strict";
import test from "node:test";

import { claimBrowserPageHandoff, nextBrowserPageHandoffNavigation } from
  "../src/browser/browser-agent-task-navigation.js";

const page = { title: "Role", url: "https://jobs.example/roles/42" };

test("no page handoff request is never claimable", () => {
  assert.equal(claimBrowserPageHandoff(undefined, 0, true), null);
  assert.equal(claimBrowserPageHandoff(undefined, 3, false), null);
});

test("a handoff waits until the conversation and account are ready", () => {
  const request = nextBrowserPageHandoffNavigation(undefined, page)!;
  assert.equal(claimBrowserPageHandoff(request, 0, false), null);
  assert.equal(claimBrowserPageHandoff(request, 0, true), 1);
});

test("a handled handoff is not replayed on later conversation or user changes", () => {
  const request = nextBrowserPageHandoffNavigation(undefined, page)!;
  let handled = 0;
  const claimed = claimBrowserPageHandoff(request, handled, true);
  assert.equal(claimed, request.sequence);
  handled = claimed!;
  // Deleting the current conversation re-assigns `current`; re-login re-assigns `user`.
  assert.equal(claimBrowserPageHandoff(request, handled, false), null);
  assert.equal(claimBrowserPageHandoff(request, handled, true), null);
  assert.equal(claimBrowserPageHandoff(request, handled, true), null);
});

test("a newer handoff sequence is claimable again", () => {
  const first = nextBrowserPageHandoffNavigation(undefined, page)!;
  const handled = claimBrowserPageHandoff(first, 0, true)!;
  const second = nextBrowserPageHandoffNavigation(first, { ...page, intent: "analyze_jd" })!;
  assert.equal(claimBrowserPageHandoff(second, handled, true), 2);
  assert.equal(claimBrowserPageHandoff(second, 2, true), null);
});

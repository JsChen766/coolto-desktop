import assert from "node:assert/strict";
import test from "node:test";

import { ManagedTaskObservationCache } from
  "../src/agent-task/managed-task-observation-cache.js";

test("managed task observation cache stays bounded and run scoped", () => {
  const cache = new ManagedTaskObservationCache();
  for (let index = 0; index < 65; index += 1) {
    cache.record("run-1", {
      tab: { id: `tab-${index}`, url: `https://jobs.example/${index}` },
      page: { text: `role-${index}` },
    }, null);
  }
  assert.equal(cache.hash("run-1", "tab-0", "https://jobs.example/0"), null);
  assert.ok(cache.hash("run-1", "tab-64", "https://jobs.example/64"));
  assert.equal(cache.hash("run-2", "tab-64", "https://jobs.example/64"), null);
});

import assert from "node:assert/strict";
import test from "node:test";

import { AgentRuntimeProjectionObserver } from
  "../src/agent-task/runtime-projection-observer.js";

test("runtime projection keeps only the current run and finishes by call", () => {
  const observer = new AgentRuntimeProjectionObserver();
  let changes = 0;
  observer.subscribe(() => { throw new Error("projection listener failed"); });
  const unsubscribe = observer.subscribe(() => { changes += 1; });
  observer.start(action("call-old", "run-old"));
  observer.start(action("call-new", "run-new"));
  assert.equal(observer.current("task", "run-old"), null);
  assert.equal(observer.current("task", "run-new")?.callId, "call-new");
  observer.finish("call-old");
  assert.equal(changes, 2);
  observer.finish("call-new");
  assert.equal(observer.current("task", "run-new"), null);
  assert.equal(changes, 3);
  unsubscribe();
});

function action(callId: string, runId: string) {
  return {
    callId, runId, taskId: "task", toolName: "browser_snapshot",
    tabId: "tab", targetOrigin: "https://jobs.example",
    startedAt: "2026-08-30T12:00:00.000Z",
  };
}

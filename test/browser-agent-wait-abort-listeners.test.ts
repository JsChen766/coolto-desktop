import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";

import { waitForBrowserCondition } from "../src/desktop/main/browser/browser-agent-wait.js";

// "load" 条件永远不满足的假 webContents：迫使等待循环一直轮询。
function neverLoadedContents() {
  return {
    isDestroyed: () => false,
    isLoading: () => true,
    isLoadingMainFrame: () => true,
  };
}

test("browser wait leaves no abort listeners on the run signal after timing out", async () => {
  const ac = new AbortController();
  await assert.rejects(
    waitForBrowserCondition(neverLoadedContents() as never, { kind: "load", timeoutMs: 500 }, ac.signal),
    /超时/u,
  );
  assert.equal(getEventListeners(ac.signal, "abort").length, 0);
});

test("browser wait rejects promptly on abort and leaves no abort listeners", async () => {
  const ac = new AbortController();
  const started = Date.now();
  const pending = waitForBrowserCondition(
    neverLoadedContents() as never, { kind: "load", timeoutMs: 5000 }, ac.signal,
  );
  setTimeout(() => ac.abort(), 150);
  await assert.rejects(pending, /已取消/u);
  assert.ok(Date.now() - started < 2000, "abort should end the wait well before its timeout");
  assert.equal(getEventListeners(ac.signal, "abort").length, 0);
});

test("browser wait rejects immediately when the run signal is already aborted", async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    waitForBrowserCondition(neverLoadedContents() as never, { kind: "load", timeoutMs: 5000 }, ac.signal),
    /已取消/u,
  );
  assert.equal(getEventListeners(ac.signal, "abort").length, 0);
});

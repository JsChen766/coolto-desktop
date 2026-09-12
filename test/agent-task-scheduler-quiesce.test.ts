import assert from "node:assert/strict";
import test from "node:test";

import { AgentTaskScheduler } from "../src/agent-task/agent-task-scheduler.js";

test("scheduler quiesce drains preparation and prevents a late runner start", async () => {
  const prepared = Promise.withResolvers<void>();
  const quiesced = Promise.withResolvers<void>();
  let starts = 0;
  const scheduler = new AgentTaskScheduler(
    { tasks: { list: async () => [{ id: "task-1", status: "queued" }] } } as never,
    { start: async () => { starts += 1; }, resumeFromEvents: async () => undefined } as never,
    async () => prepared.promise,
  );
  const tick = scheduler.tick();
  const draining = scheduler.quiesce().then(() => quiesced.resolve());
  await Promise.resolve();
  assert.equal(starts, 0);
  prepared.resolve();
  await draining;
  await tick;
  assert.equal(starts, 0);
  assert.equal((await Promise.race([
    quiesced.promise.then(() => "done"),
    new Promise((resolve) => setTimeout(() => resolve("timeout"), 50)),
  ])), "done");
});

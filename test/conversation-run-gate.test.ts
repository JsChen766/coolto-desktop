import assert from "node:assert/strict";
import test from "node:test";

import { ConversationRunGate } from "../src/desktop/main/conversation-run-gate.js";

test("same-conversation approval waits for the active prompt to settle", async () => {
  const gate = new ConversationRunGate();
  gate.begin("conversation-a");
  let acquired = false;
  const approval = gate.beginAfterCurrent("conversation-a").then(() => {
    acquired = true;
  });

  await Promise.resolve();
  assert.equal(acquired, false);
  gate.finish("conversation-a");
  await approval;
  assert.equal(gate.currentConversationId, "conversation-a");

  gate.finish("conversation-a");
  assert.equal(gate.isRunning, false);
});

test("queued same-conversation operations receive the gate in order", async () => {
  const gate = new ConversationRunGate();
  gate.begin("conversation-a");
  const order: number[] = [];
  const first = gate.beginAfterCurrent("conversation-a").then(() => order.push(1));
  const second = gate.beginAfterCurrent("conversation-a").then(() => order.push(2));

  gate.finish("conversation-a");
  await first;
  assert.deepEqual(order, [1]);
  gate.finish("conversation-a");
  await second;
  assert.deepEqual(order, [1, 2]);
  gate.finish("conversation-a");
});

test("a different conversation cannot enter or queue behind an active run", async () => {
  const gate = new ConversationRunGate();
  gate.begin("conversation-a");

  assert.throws(
    () => gate.begin("conversation-b"),
    /另一个对话正在回复/u,
  );
  await assert.rejects(
    gate.beginAfterCurrent("conversation-b"),
    /另一个对话正在回复/u,
  );

  gate.finish("conversation-b");
  assert.equal(gate.currentConversationId, "conversation-a");
  gate.finish("conversation-a");
});
test("quiesce rejects queued work and blocks new runs", async () => {
  const gate = new ConversationRunGate();
  gate.begin("conversation-a");
  const queued = gate.beginAfterCurrent("conversation-a");
  gate.quiesce();
  await assert.rejects(queued, /运行时正在退出/u);
  assert.throws(() => gate.begin("conversation-a"), /运行时正在退出/u);
  gate.finish("conversation-a");
  assert.equal(gate.isRunning, false);
});

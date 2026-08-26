import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("chat exposes persisted run terminal while sidebar stays compact", async () => {
  const [workspace, terminal, sidebar, record] = await Promise.all([
    source("../src/desktop/renderer/src/app/AppChatWorkspace.vue"),
    source("../src/desktop/renderer/src/components/ChatRunTerminal.vue"),
    source("../src/desktop/renderer/src/components/Sidebar.vue"),
    source("../src/desktop/main/conversation-record.ts"),
  ]);

  assert.match(workspace, /ChatRunTerminal/u);
  assert.match(workspace, /current\.lastRun/u);
  assert.match(terminal, /打开已保留草稿/u);
  assert.match(terminal, /继续完成/u);
  assert.doesNotMatch(sidebar, /conversation-run-state|conversationStatusLabel/u);
  assert.match(record, /version: 1 \| 2 \| 3 \| 4/u);
  assert.match(record, /lastRun\?: ConversationRunTerminal/u);
});

function source(relative: string): Promise<string> {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

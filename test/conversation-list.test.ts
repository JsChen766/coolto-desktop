import assert from "node:assert/strict";
import test from "node:test";

import { findReusableEmptyConversation } from "../src/desktop/renderer/src/chat/conversation-list.js";
import type { ConversationSummary } from "../src/desktop/shared/types.js";

test("new chat reuses the newest existing untitled empty conversation", () => {
  const conversations = [
    conversation("blank-newest", "新对话", 0),
    conversation("blank-older", "新对话", 0),
    conversation("used", "新对话", 2),
  ];

  assert.equal(findReusableEmptyConversation(conversations)?.id, "blank-newest");
});

test("renamed empty conversations do not block a genuinely new chat", () => {
  const conversations = [conversation("renamed", "稍后再聊", 0)];

  assert.equal(findReusableEmptyConversation(conversations), undefined);
});

function conversation(
  id: string,
  title: string,
  messageCount: number,
): ConversationSummary {
  const now = "2026-07-28T08:00:00.000Z";
  return { id, title, messageCount, createdAt: now, updatedAt: now };
}

import assert from "node:assert/strict";
import test from "node:test";

import { latestLinkedConversation } from
  "../src/desktop/renderer/src/chat/resume-conversation-navigation.js";
import type { ConversationSummary } from
  "../src/desktop/shared/types/conversations.js";
import type { ResumeDraftSummary } from "../src/resume/draft/types.js";

test("local Resume navigation selects the newest existing linked conversation", () => {
  const draft = {
    artifactId: "draft-1",
    conversationIds: ["missing", "older", "newer"],
  } as ResumeDraftSummary;
  const conversations = [
    conversation("older", "2026-08-30T00:00:00.000Z"),
    conversation("newer", "2026-08-31T00:00:00.000Z"),
    conversation("unrelated", "2026-09-01T00:00:00.000Z"),
  ];

  assert.equal(latestLinkedConversation(draft, conversations)?.id, "newer");
});

test("a Resume-bound blank conversation is not reusable as a global new chat", async () => {
  const { findReusableEmptyConversation } = await import(
    "../src/desktop/renderer/src/chat/conversation-list.js"
  );
  const bound = {
    ...conversation("bound", "2026-08-31T00:00:00.000Z"),
    title: "新对话",
    messageCount: 0,
    activeResumeArtifactId: "draft-1",
  };
  assert.equal(findReusableEmptyConversation([bound]), undefined);
});

function conversation(id: string, updatedAt: string): ConversationSummary {
  return {
    id,
    title: "对话",
    createdAt: updatedAt,
    updatedAt,
    messageCount: 1,
  };
}

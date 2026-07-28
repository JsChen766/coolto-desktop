import assert from "node:assert/strict";
import test from "node:test";

import {
  anchorUnassigned,
  inferArtifactAnchor,
  latestNewAssistantMessageId,
} from "../src/desktop/shared/artifact-anchor.js";
import type { ChatMessage } from "../src/desktop/shared/types.js";

const messages: ChatMessage[] = [
  message("u1", "user", "2026-07-28T01:00:00.000Z"),
  message("a1", "assistant", "2026-07-28T01:00:02.000Z"),
  message("u2", "user", "2026-07-28T01:01:00.000Z"),
  message("a2", "assistant", "2026-07-28T01:01:03.000Z"),
];

test("artifact anchors to the assistant message that completed its turn", () => {
  assert.equal(
    inferArtifactAnchor(messages, "2026-07-28T01:01:01.000Z"),
    "a2",
  );
});

test("legacy artifact keeps a stable last-assistant fallback", () => {
  assert.equal(
    inferArtifactAnchor(messages, "2026-07-28T02:00:00.000Z"),
    "a2",
  );
});

test("response anchoring only fills artifacts without an original message", () => {
  const artifacts = [
    { anchorMessageId: "a1" },
    {} as { anchorMessageId?: string },
  ];
  anchorUnassigned(artifacts, "a2");
  assert.deepEqual(artifacts, [
    { anchorMessageId: "a1" },
    { anchorMessageId: "a2" },
  ]);
  assert.equal(latestNewAssistantMessageId(messages, new Set(["u1", "a1"])), "a2");
});

function message(
  id: string,
  role: ChatMessage["role"],
  createdAt: string,
): ChatMessage {
  return { id, role, createdAt, content: id };
}

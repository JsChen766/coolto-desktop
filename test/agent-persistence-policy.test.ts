import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { sanitizeAgentMessagesForPersistence } from "../src/agent/persistence-policy.js";

test("source snapshots are redacted before Agent transcripts are persisted", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "snapshot-call",
      toolName: "get_resume_source_snapshot",
      content: [{ type: "text", text: "private current revision content" }],
      details: { experiences: [{ content: "private current revision content" }] },
      isError: false,
      timestamp: 1,
    },
  ] satisfies AgentMessage[];

  const persisted = sanitizeAgentMessagesForPersistence(messages);
  const serialized = JSON.stringify(persisted);

  assert.doesNotMatch(serialized, /private current revision content/);
  assert.match(serialized, /snapshot expired/);
  assert.equal("details" in persisted[0]!, false);
  assert.match(JSON.stringify(messages), /private current revision content/);
});

test("ordinary Agent messages are cloned without redaction", () => {
  const messages = [
    {
      role: "user",
      content: [{ type: "text", text: "hello" }],
      timestamp: 1,
    },
  ] satisfies AgentMessage[];

  const persisted = sanitizeAgentMessagesForPersistence(messages);

  assert.deepEqual(persisted, messages);
  assert.notStrictEqual(persisted[0], messages[0]);
});

test("in-memory resume candidates are redacted with a rebuild instruction", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "candidate-call",
      toolName: "patch_resume_candidate",
      content: [{ type: "text", text: "private candidate and evidence" }],
      details: { candidateId: "candidate-old", visibleText: "private candidate" },
      isError: false,
      timestamp: 1,
    },
  ] satisfies AgentMessage[];

  const persisted = sanitizeAgentMessagesForPersistence(messages);
  const serialized = JSON.stringify(persisted);

  assert.doesNotMatch(serialized, /private candidate/);
  assert.doesNotMatch(serialized, /candidate-old/);
  assert.match(serialized, /prepare_resume_draft again/);
  assert.match(serialized, /do not reuse the old candidateId/);
});

test("cloud Resume content is transient and must be read again", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "resume-call",
      toolName: "get_resume",
      content: [{ type: "text", text: "private cloud Resume content" }],
      details: { structured: { private: "cloud Resume content" } },
      isError: false,
      timestamp: 1,
    },
  ] satisfies AgentMessage[];

  const persisted = sanitizeAgentMessagesForPersistence(messages);
  const serialized = JSON.stringify(persisted);

  assert.doesNotMatch(serialized, /private cloud Resume content/);
  assert.match(serialized, /Call get_resume again/);
});

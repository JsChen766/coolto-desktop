import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { sanitizeAgentMessagesForPersistence } from "../src/agent/persistence-policy.js";

test("resume workspace sources are redacted before transcripts are persisted", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "snapshot-call",
      toolName: "create_resume_workspace",
      content: [{ type: "text", text: "private current revision content" }],
      details: { experiences: [{ content: "private current revision content" }] },
      isError: false,
      timestamp: 1,
    },
  ] satisfies AgentMessage[];

  const persisted = sanitizeAgentMessagesForPersistence(messages);
  const serialized = JSON.stringify(persisted);

  assert.doesNotMatch(serialized, /private current revision content/);
  assert.match(serialized, /workspace expired/);
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

test("in-memory resume revisions are redacted with a rebuild instruction", () => {
  const messages = [
    {
      role: "toolResult",
      toolCallId: "candidate-call",
      toolName: "apply_resume_content",
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
  assert.match(serialized, /create_resume_workspace again/);
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

test("material boundary results expire with the in-memory resume workspace", () => {
  const messages = ["pause_resume_for_material", "decline_resume_material"]
    .map((toolName, index) => ({
      role: "toolResult" as const,
      toolCallId: `material-call-${index}`,
      toolName,
      content: [{ type: "text" as const, text: "candidate-old material request" }],
      details: { candidateId: "candidate-old", requestId: "request-old" },
      isError: false,
      timestamp: index + 1,
    })) satisfies AgentMessage[];

  const serialized = JSON.stringify(sanitizeAgentMessagesForPersistence(messages));

  assert.doesNotMatch(serialized, /candidate-old|request-old/u);
  assert.match(serialized, /create_resume_workspace again/u);
});

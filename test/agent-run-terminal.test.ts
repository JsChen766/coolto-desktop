import assert from "node:assert/strict";
import test from "node:test";

import { createRunTerminal } from
  "../src/desktop/main/agent-run-terminal.js";

test("run terminal stores a safe recoverable failure without raw details", () => {
  const terminal = createRunTerminal({
    cancelled: false,
    artifactId: "draft-1",
    error: new Error("apply_resume_content schema secret-id"),
    now: "2026-08-26T00:00:00.000Z",
  });

  assert.equal(terminal.status, "failed");
  assert.equal(terminal.artifactId, "draft-1");
  assert.equal(terminal.canContinue, true);
  assert.doesNotMatch(terminal.message ?? "", /apply_resume_content|secret-id/u);
});

test("material and cancellation terminals remain distinct", () => {
  assert.equal(createRunTerminal({
    cancelled: false,
    workspaceStatus: "needs_user_decision",
  }).status, "needs_user_decision");
  assert.equal(createRunTerminal({
    cancelled: true,
    workspaceStatus: "writing",
  }).status, "cancelled");
});

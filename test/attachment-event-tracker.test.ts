import assert from "node:assert/strict";
import test from "node:test";

import type {
  DesktopAgentEvent,
  DesktopApprovalRequest,
} from "../src/desktop/shared/types.js";
import { AttachmentEventTracker } from "../src/desktop/renderer/src/attachments/attachment-event-tracker.js";

const attachment = {
  id: "attachment-11111111-1111-4111-8111-111111111111",
  filename: "resume.docx",
  type: "docx" as const,
  sizeBytes: 42_000,
};

test("attachment tracker follows parse and successful import events", () => {
  const tracker = new AttachmentEventTracker();
  tracker.sync("conversation-1", attachment);

  assert.equal(tracker.get("conversation-1")?.status, "selected");
  tracker.handle("conversation-1", {
    type: "tool.started",
    callId: "parse-1",
    name: "parse_selected_file",
    arguments: { fileId: attachment.id },
  });
  assert.equal(tracker.get("conversation-1")?.status, "parsing");

  tracker.handle("conversation-1", {
    type: "tool.completed",
    callId: "parse-1",
    name: "parse_selected_file",
    isError: false,
  });
  assert.equal(tracker.get("conversation-1")?.status, "parsed");

  tracker.handle("conversation-1", approvalRequired("approval-1"));
  tracker.handle("conversation-1", {
    type: "approval.resolved",
    requestId: "approval-1",
    decision: "accept",
  });
  tracker.handle("conversation-1", {
    type: "approval.completed",
    requestId: "approval-1",
    summary: "已写入 2 条经历",
    details: { saved: [{}, {}], failed: [] },
  });
  assert.equal(tracker.get("conversation-1")?.status, "saved");
});

test("attachment tracker preserves retry state for reject and partial failure", () => {
  const tracker = new AttachmentEventTracker();
  tracker.sync("conversation-1", attachment);
  markParsed(tracker);

  tracker.handle("conversation-1", approvalRequired("approval-reject"));
  tracker.handle("conversation-1", {
    type: "approval.resolved",
    requestId: "approval-reject",
    decision: "reject",
  });
  tracker.handle("conversation-1", {
    type: "approval.completed",
    requestId: "approval-reject",
    summary: "不应关联",
  });
  assert.equal(tracker.get("conversation-1")?.status, "parsed");

  tracker.handle("conversation-1", approvalRequired("approval-partial"));
  tracker.handle("conversation-1", {
    type: "approval.resolved",
    requestId: "approval-partial",
    decision: "accept",
  });
  tracker.handle("conversation-1", {
    type: "approval.completed",
    requestId: "approval-partial",
    summary: "已写入 1 条，1 条失败",
    details: { saved: [{}], failed: [{ clientId: "candidate-2" }] },
  });
  assert.equal(tracker.get("conversation-1")?.status, "partial");
  assert.match(tracker.get("conversation-1")?.message ?? "", /1 条经历/u);
});

test("attachment tracker isolates conversations and reports parse errors", () => {
  const tracker = new AttachmentEventTracker();
  tracker.sync("conversation-1", attachment);
  tracker.sync("conversation-2", {
    ...attachment,
    id: "attachment-22222222-2222-4222-8222-222222222222",
    filename: "other.pdf",
    type: "pdf",
  });

  tracker.handle("conversation-1", {
    type: "tool.started",
    callId: "parse-failed",
    name: "parse_selected_file",
    arguments: { fileId: attachment.id },
  });
  tracker.handle("conversation-1", {
    type: "tool.completed",
    callId: "parse-failed",
    name: "parse_selected_file",
    isError: true,
  });
  assert.equal(tracker.get("conversation-1")?.status, "error");
  assert.equal(tracker.get("conversation-2")?.status, "selected");

  tracker.remove("conversation-1");
  assert.equal(tracker.get("conversation-1"), undefined);
  assert.equal(tracker.get("conversation-2")?.filename, "other.pdf");
});

test("attachment tracker turns an interrupted parse into a retryable error", () => {
  const tracker = new AttachmentEventTracker();
  tracker.sync("conversation-1", attachment);
  tracker.handle("conversation-1", {
    type: "tool.started",
    callId: "parse-cancelled",
    name: "parse_selected_file",
    arguments: { fileId: attachment.id },
  });
  tracker.handle("conversation-1", { type: "run.completed" });

  assert.equal(tracker.get("conversation-1")?.status, "error");
  assert.match(tracker.get("conversation-1")?.message ?? "", /重新发送/u);
});

function markParsed(tracker: AttachmentEventTracker): void {
  tracker.handle("conversation-1", {
    type: "tool.started",
    callId: "parse-ready",
    name: "parse_selected_file",
    arguments: { fileId: attachment.id },
  });
  tracker.handle("conversation-1", {
    type: "tool.completed",
    callId: "parse-ready",
    name: "parse_selected_file",
    isError: false,
  });
}

function approvalRequired(requestId: string): DesktopAgentEvent {
  const request: DesktopApprovalRequest = {
    id: requestId,
    actionType: "experience.import",
    risk: "write",
    title: "写入经历",
    description: "确认写入",
    preview: { summary: [] },
    createdAt: "2026-07-24T00:00:00.000Z",
  };
  return { type: "approval.required", request };
}

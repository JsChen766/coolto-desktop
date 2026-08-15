import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import {
  buildAttachmentNotice,
  mergeMessageAttachments,
} from "../src/desktop/main/conversation-attachments.js";
import {
  presentConversationContent,
  projectConversationMessages,
} from "../src/desktop/main/conversation-presentation.js";
import type { StoredMessageAttachment } from "../src/desktop/main/conversation-record.js";

function userMessage(timestamp: number, text = "导入这份简历") {
  return { role: "user" as const, content: text, timestamp };
}

test("pending attachment binds to the last user message once", () => {
  const messages = [
    userMessage(1000, "第一条"),
    userMessage(2000, "第二条"),
  ];
  const pending = [
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf" as const, sizeBytes: 10, status: "pending" as const },
  ];
  const merged = mergeMessageAttachments([], pending, messages);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.messageTimestamp, 2000);
  assert.equal(merged[0]!.filename, "resume.pdf");
});

test("same fileId is not bound twice; existing bindings survive", () => {
  const existing: StoredMessageAttachment[] = [
    { messageTimestamp: 1000, fileId: "attachment-a", filename: "resume.pdf", type: "pdf", sizeBytes: 10, status: "pending" },
  ];
  const messages = [userMessage(2000, "再发一次")];
  const pending = [
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf" as const, sizeBytes: 10, status: "pending" as const },
    { fileId: "attachment-b", filename: "notes.md", type: "markdown" as const, sizeBytes: 20, status: "pending" as const },
  ];
  const merged = mergeMessageAttachments(existing, pending, messages);
  assert.equal(merged.length, 2);
  const second = merged.find((stored) => stored.fileId === "attachment-b");
  assert.equal(second?.messageTimestamp, 2000);
  assert.equal(merged[0]?.messageTimestamp, 1000);
});

test("no user message means nothing is bound", () => {
  const assistant: AgentMessage = {
    role: "assistant",
    content: [{ type: "text", text: "好的" }],
    api: "openai",
    provider: "openai",
    model: "gpt-4o",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 3000,
  };
  const pending = [
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf" as const, sizeBytes: 10, status: "pending" as const },
  ];
  assert.deepEqual(mergeMessageAttachments([], pending, [assistant]), []);
});

test("projection attaches stored attachments to the matching user message", () => {
  const messages = [
    userMessage(1000, "第一条"),
    userMessage(2000, "第二条"),
  ];
  const stored: StoredMessageAttachment[] = [
    { messageTimestamp: 2000, fileId: "attachment-a", filename: "resume.pdf", type: "pdf", sizeBytes: 10, status: "parsed" },
  ];
  const visible = projectConversationMessages(messages, stored);
  assert.equal(visible.length, 2);
  assert.equal(visible[0]?.attachments, undefined);
  assert.deepEqual(visible[1]?.attachments, [
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf", sizeBytes: 10, status: "parsed" },
  ]);
});

test("attachment notice names the files and is stripped from presentation", () => {
  const notice = buildAttachmentNotice([
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf", sizeBytes: 10, status: "pending" },
    { fileId: "attachment-b", filename: "经历.md", type: "markdown", sizeBytes: 20, status: "pending" },
  ]);
  assert.match(notice, /<attachment_notice>/u);
  assert.match(notice, /resume\.pdf（PDF）/u);
  assert.match(notice, /parse_selected_file/u);

  const presented = presentConversationContent(
    `请导入简历\n\n${notice}`,
    "user",
  );
  assert.equal(presented, "请导入简历");
  assert.doesNotMatch(presented, /attachment_notice/u);
});

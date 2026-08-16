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

test("pending attachment binds to the anchored user message, not a later internal one", () => {
  const messages = [
    userMessage(1000, "第一条"),
    userMessage(2000, "第二条（锚点）"),
    userMessage(3000, "内部续写提示词"),
  ];
  const pending = [
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf" as const, sizeBytes: 10, status: "pending" as const },
  ];
  const merged = mergeMessageAttachments([], pending, messages, 2000);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.messageTimestamp, 2000);
  assert.equal(merged[0]!.filename, "resume.pdf");
});

test("missing anchor falls back to the last user message", () => {
  const messages = [userMessage(1000, "第一条"), userMessage(2000, "第二条")];
  const pending = [
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf" as const, sizeBytes: 10, status: "pending" as const },
  ];
  const merged = mergeMessageAttachments([], pending, messages, 9999);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]!.messageTimestamp, 2000);
});

test("re-attaching the same file in a new send binds again; within-batch duplicates collapse", () => {
  const existing: StoredMessageAttachment[] = [
    { messageTimestamp: 1000, fileId: "attachment-a", filename: "resume.pdf", type: "pdf", sizeBytes: 10, status: "parsed" },
  ];
  const messages = [userMessage(2000, "再发一次同一份文件")];
  const pending = [
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf" as const, sizeBytes: 10, status: "pending" as const },
    { fileId: "attachment-a", filename: "resume.pdf", type: "pdf" as const, sizeBytes: 10, status: "pending" as const },
    { fileId: "attachment-b", filename: "notes.md", type: "markdown" as const, sizeBytes: 20, status: "pending" as const },
  ];
  const merged = mergeMessageAttachments(existing, pending, messages, 2000);
  assert.equal(merged.length, 3);
  const rebound = merged.filter((stored) => stored.fileId === "attachment-a");
  assert.equal(rebound.length, 2);
  assert.deepEqual(
    rebound.map((stored) => stored.messageTimestamp).sort(),
    [1000, 2000],
  );
  const second = merged.find((stored) => stored.fileId === "attachment-b");
  assert.equal(second?.messageTimestamp, 2000);
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

test("projection attaches assistant completedAt from timings", () => {
  const messages = [
    userMessage(1000, "第一条"),
    {
      role: "assistant" as const,
      content: [{ type: "text" as const, text: "好的" }],
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
      stopReason: "stop" as const,
      timestamp: 2000,
    },
  ];
  const timings = { "2000": "2026-08-16T12:00:00.000Z" };
  const visible = projectConversationMessages(messages, [], timings);
  assert.equal(visible.length, 2);
  assert.equal(visible[1]?.role, "assistant");
  assert.equal(visible[1]?.completedAt, "2026-08-16T12:00:00.000Z");
  assert.equal(visible[0]?.completedAt, undefined);
});

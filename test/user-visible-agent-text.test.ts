import assert from "node:assert/strict";
import test from "node:test";

import {
  appendVisibleAssistantDelta,
  presentAssistantText,
} from "../src/agent/user-visible-text.js";
import { presentConversationContent } from
  "../src/desktop/main/conversation-presentation.js";

test("assistant presentation removes internal tools and identifiers", () => {
  const value = presentAssistantText(
    "调用 create_resume_workspace 需要 experienceId=" +
    "123e4567-e89b-12d3-a456-426614174000，call_00_abcdefgh 失败。",
  );
  assert.equal(
    value,
    "调用 内部操作 需要 内部记录=内部记录，内部调用 失败。",
  );
});

test("streaming presentation also handles split internal tool names", () => {
  const first = appendVisibleAssistantDelta("", "调用 create_resume_");
  const second = appendVisibleAssistantDelta(first, "workspace 失败");
  assert.equal(second, "调用 内部操作 失败");
});

test("only assistant projection redacts internal implementation terms", () => {
  assert.equal(
    presentConversationContent("请检查 create_resume_workspace", "user"),
    "请检查 create_resume_workspace",
  );
  assert.equal(
    presentConversationContent("请检查 create_resume_workspace", "assistant"),
    "请检查 内部操作",
  );
});

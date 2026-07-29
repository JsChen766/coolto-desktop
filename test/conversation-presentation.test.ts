import assert from "node:assert/strict";
import test from "node:test";

import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { wrapInternalPrompt } from "../src/agent/internal-prompt.js";
import {
  presentConversationTitle,
  projectConversationMessages,
} from "../src/desktop/main/conversation-presentation.js";

test("conversation projection hides wrapped host continuation prompts", () => {
  const messages = projectConversationMessages([
    user("请保存这个 JD", 1),
    user(wrapInternalPrompt("internal jdId: secret-id"), 2),
    assistant("JD 已保存。", 3),
  ]);
  assert.deepEqual(
    messages.map((message) => message.content),
    ["请保存这个 JD", "JD 已保存。"],
  );
  assert.doesNotMatch(JSON.stringify(messages), /secret-id/);
});

test("conversation projection hides legacy JD and browser continuations", () => {
  const messages = projectConversationMessages([
    user(
      "JD「测试」已保存到本地同步队列（jdId: legacy-id）。" +
        "请根据对话历史中用户的原始意图继续下一步操作。",
      1,
    ),
    user(
      "浏览器写权限已授予（意图：填写表单）。请立即继续，" +
        "完成后调用 browser_start_review。",
      2,
    ),
    assistant("操作完成。", 3),
  ]);
  assert.deepEqual(messages.map((message) => message.content), ["操作完成。"]);
});

test("resume reference metadata is hidden while user text stays visible", () => {
  const messages = projectConversationMessages([
    user(
      "修改这份简历\n<resume_reference>\nartifact_id: internal-id\n" +
        "</resume_reference>",
      1,
    ),
  ]);
  assert.equal(messages[0]?.content, "修改这份简历");
  assert.doesNotMatch(JSON.stringify(messages), /internal-id/);
});

test("JD reference metadata is hidden while the exact ID remains Agent-only", () => {
  const messages = projectConversationMessages([
    user(
      "请为岗位「测试」匹配经历库，并给出匹配结果。\n" +
        "<jd_reference>\njd_id: jd-secret\n</jd_reference>",
      1,
    ),
  ]);
  assert.equal(messages[0]?.content, "请为岗位「测试」匹配经历库，并给出匹配结果。");
  assert.doesNotMatch(JSON.stringify(messages), /jd-secret|jd_reference/);
});

test("legacy generated JD actions redact IDs from messages and stored titles", () => {
  const agentMessages = [user(
    "请针对 JD「测试岗位」（jdId: legacy-secret）匹配经历库并给出匹配结果。",
    1,
  )];
  const messages = projectConversationMessages(agentMessages);
  assert.equal(
    messages[0]?.content,
    "请为岗位「测试岗位」匹配经历库，并给出匹配结果。",
  );
  assert.equal(
    presentConversationTitle("请针对 JD「测试岗位」（jdId: legacy", agentMessages),
    "请为岗位「测试岗位」匹配经历库，并给出匹配结果。".slice(0, 28),
  );
});

function user(content: string, timestamp: number): AgentMessage {
  return { role: "user", content, timestamp } as AgentMessage;
}

function assistant(content: string, timestamp: number): AgentMessage {
  return { role: "assistant", content, timestamp } as unknown as AgentMessage;
}

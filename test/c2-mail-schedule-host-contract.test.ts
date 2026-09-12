import assert from "node:assert/strict";
import test from "node:test";

import { assertMailConnectionsBelongToAccount } from "../src/desktop/main/agent-task/validate-mail-schedule-connections.js";
import { mailScheduleLoopTemplate } from "../src/tools/ai-native-loop-templates.js";

test("mail schedule loop rejects foreign connection ids", () => {
  assert.throws(
    () => assertMailConnectionsBelongToAccount(
      ["conn-a", "conn-b"],
      new Set(["conn-a"]),
    ),
    /不属于当前账号/,
  );
});

test("mail schedule loop template carries mail_app_schedule kind", () => {
  const input = mailScheduleLoopTemplate({
    conversationId: "conv-c2",
    goal: "跟踪面试邮件",
    directions: ["received"],
    pollIntervalMinutes: 15,
    mailConnectionIds: ["conn-a"],
    browserWebmail: false,
    allowedDomains: [],
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  assert.equal(input.jobCriteria.loopKind, "mail_app_schedule");
  assert.ok(input.allowedActions.includes("mail.read"));
  assert.ok(input.allowedActions.includes("tracker.interview.update"));
});

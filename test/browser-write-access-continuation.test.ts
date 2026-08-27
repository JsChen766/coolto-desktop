import assert from "node:assert/strict";
import test from "node:test";

import { isWrappedInternalPrompt } from "../src/agent/internal-prompt.js";
import { buildBrowserWriteAccessContinuationPrompt } from
  "../src/desktop/main/browser-write-access-continuation.js";

test("browser continuation checks for a newer cancellation before writing", () => {
  const prompt = buildBrowserWriteAccessContinuationPrompt("填写申请表");
  assert.equal(isWrappedInternalPrompt(prompt), true);
  assert.match(prompt, /更新的取消、暂停或目标变更指令/u);
  assert.match(prompt, /用户当前最新指令一致/u);
  assert.match(prompt, /browser_start_review/u);
  assert.match(prompt, /永远不要点击提交\/发送按钮/u);
});

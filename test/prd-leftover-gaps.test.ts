import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveWindowCloseAction } from "../src/desktop/main/window-close-policy.js";
import {
  buildAnalyzeJdPageInstruction,
  buildInterviewQuestionsInstruction,
} from "../src/job-assets/job-action-instruction.js";

test("close to tray hides a clean window and still prompts when drafts are dirty", () => {
  assert.equal(resolveWindowCloseAction({
    forceClose: false, quitting: false, draftState: "saved",
  }), "hide");
  assert.equal(resolveWindowCloseAction({
    forceClose: false, quitting: false, draftState: "dirty",
  }), "prompt-hide");
  assert.equal(resolveWindowCloseAction({
    forceClose: false, quitting: true, draftState: "dirty",
  }), "prompt-quit");
  assert.equal(resolveWindowCloseAction({
    forceClose: true, quitting: false, draftState: "dirty",
  }), "allow");
});

test("analyze JD and interview instructions stay user-facing", () => {
  const analyze = buildAnalyzeJdPageInstruction("最终状态回归", "https://jobs.example/role");
  const interview = buildInterviewQuestionsInstruction("最终状态回归");
  assert.match(analyze, /最终状态回归/);
  assert.match(analyze, /https:\/\/jobs\.example\/role/);
  assert.match(interview, /面试问题/);
  assert.doesNotMatch(`${analyze}${interview}`, /jdId|taskId|019fa/i);
});

test("leftover PRD surfaces expose disclosure, JD analyze, URL paste, and interview prep", async () => {
  const files = await Promise.all([
    readFile(new URL("../src/desktop/renderer/src/components/Composer.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/renderer/src/components/PrivacyDataSection.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/renderer/src/browser-shell/BrowserAnalyzeJdButton.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/renderer/src/browser-shell/BrowserShell.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/renderer/src/components/EmptyState.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/renderer/src/components/ApplicationDetailPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/main/ipc.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/tools/registry.ts", import.meta.url), "utf8"),
  ]);
  const [composer, privacy, analyze, browser, empty, detail, ipc, registry] = files;
  // Composer disclaimer was removed; send-time disclosure lives in PrivacyDataSection (OSS privacy split).
  assert.match(composer, /chat-composer-send/u);
  assert.match(privacy, /发送给模型前/u);
  assert.match(privacy, /当前对话/u);
  assert.match(analyze, /分析当前 JD/u);
  assert.match(browser, /analyzeJdInApp/u);
  assert.match(empty, /粘贴岗位网页链接/u);
  assert.match(empty, /准备面试问题/u);
  assert.match(detail, /prepareInterview/u);
  assert.match(detail, /准备面试简报/u);
  assert.match(ipc, /isQuitting/u);
  assert.match(registry, /createFetchPublicHttpsTextTool/u);
});

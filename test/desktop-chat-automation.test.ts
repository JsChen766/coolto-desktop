import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { parseDesktopChatArgs } from "../scripts/support/desktop-chat-options.mjs";

import {
  completeToolRun,
  type ToolRun,
} from "../src/desktop/renderer/src/chat/tool-run-state.js";

test("desktop tool runs retain and clear completion diagnostics", () => {
  const runs: ToolRun[] = [{
    callId: "call-1",
    name: "apply_resume_content",
    status: "running",
  }];
  completeToolRun(runs, {
    callId: "call-1",
    isError: true,
    error: "content validation failed",
    progressLabel: "正在调整简历内容并重新排版",
  });
  assert.deepEqual(runs[0], {
    callId: "call-1",
    name: "apply_resume_content",
    status: "error",
    error: "content validation failed",
    progressLabel: "正在调整简历内容并重新排版",
  });

  completeToolRun(runs, {
    callId: "call-1",
    isError: false,
  });
  assert.equal(runs[0]?.status, "completed");
  assert.equal(runs[0]?.error, undefined);
  assert.equal(runs[0]?.progressLabel, "正在调整简历内容并重新排版");
});

test("desktop chat smoke exposes its command-line contract", () => {
  const script = fileURLToPath(new URL(
    "../scripts/run-desktop-chat-smoke.mjs",
    import.meta.url,
  ));
  const result = spawnSync(process.execPath, [script, "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--message <text>/u);
  assert.match(result.stdout, /--new-chat/u);
  assert.match(result.stdout, /--require-resume-ready/u);
  assert.match(result.stdout, /--accept-resume-augmentation/u);
  assert.match(result.stdout, /--open-resume-preview/u);
  assert.match(result.stdout, /--stop-after-reuse-workspace/u);
  assert.match(result.stdout, /--file <path>/u);
});

test("desktop chat smoke bounds stalled CDP requests", async () => {
  const source = await readFile(new URL(
    "../scripts/run-desktop-chat-smoke.mjs",
    import.meta.url,
  ), "utf8");
  assert.match(source, /CDP_REQUEST_TIMEOUT_MS = 5_000/u);
  assert.match(source, /pending\.delete\(id\)/u);
  assert.match(source, /isCdpTimeout\(error\)/u);
  assert.match(source, /resume-active-draft-status/u);
  assert.match(source, /preview-toggle/u);
  assert.match(source, /progressMessages: observedProgress/u);
  assert.match(source, /resume-generation-progress/u);
  assert.match(source, /baseDraftArtifactId/u);
});

test("desktop chat smoke parses an explicit new-chat run", () => {
  assert.deepEqual(parseDesktopChatArgs([
    "--new-chat",
    "--require-resume-ready",
    "--accept-resume-augmentation",
    "--open-resume-preview",
    "--stop-after-reuse-workspace",
    "--jd-id",
    "jd-1",
    "--message",
    "generate",
    "--timeout",
    "300000",
  ]), {
    newChat: true,
    requireResumeReady: true,
    acceptResumeAugmentation: true,
    openResumePreview: true,
    stopAfterReuseWorkspace: true,
    jdId: "jd-1",
    message: "generate",
    timeout: 300_000,
  });
});

test("desktop chat components expose the stable smoke contract", async () => {
  const composer = await readFile(new URL(
    "../src/desktop/renderer/src/components/Composer.vue",
    import.meta.url,
  ), "utf8");
  const workspace = await readFile(new URL(
    "../src/desktop/renderer/src/app/AppChatWorkspace.vue",
    import.meta.url,
  ), "utf8");
  const tools = await readFile(new URL(
    "../src/desktop/renderer/src/components/ToolActivity.vue",
    import.meta.url,
  ), "utf8");
  const navigation = await readFile(new URL(
    "../src/desktop/renderer/src/components/SidebarPrimaryNavigation.vue",
    import.meta.url,
  ), "utf8");
  const artifactPanel = await readFile(new URL(
    "../src/desktop/renderer/src/components/ArtifactPanel.vue",
    import.meta.url,
  ), "utf8");
  const artifactCard = await readFile(new URL(
    "../src/desktop/renderer/src/components/ResumeArtifactCard.vue",
    import.meta.url,
  ), "utf8");
  const chatHeader = await readFile(new URL(
    "../src/desktop/renderer/src/components/ChatHeader.vue",
    import.meta.url,
  ), "utf8");
  const approvalStyles = await readFile(new URL(
    "../src/desktop/renderer/src/styles/base-approvals.css",
    import.meta.url,
  ), "utf8");
  const approvalCard = await readFile(new URL(
    "../src/desktop/renderer/src/components/ApprovalCard.vue",
    import.meta.url,
  ), "utf8");
  const eventHandler = await readFile(new URL(
    "../src/desktop/renderer/src/chat/agent-event-handler.ts",
    import.meta.url,
  ), "utf8");
  const resumeStyle = await readFile(new URL(
    "../src/desktop/renderer/src/resume-renderer/style.css",
    import.meta.url,
  ), "utf8");

  for (const selector of [
    "chat-composer-input",
    "chat-composer-file",
    "chat-composer-send",
    "chat-composer-stop",
  ]) assert.match(composer, new RegExp(`data-testid="${selector}"`, "u"));
  assert.match(workspace, /data-testid="chat-run-error"/u);
  assert.match(tools, /data-tool-error/u);
  assert.match(tools, /data-testid="resume-generation-progress"/u);
  assert.match(navigation, /data-testid="sidebar-new-chat"/u);
  assert.match(artifactPanel, /data-testid="resume-draft-status"/u);
  assert.match(artifactPanel, /data-generation-ready/u);
  assert.match(artifactCard, /data-testid="resume-draft-status"/u);
  assert.match(chatHeader, /data-testid="resume-active-draft-status"/u);
  assert.match(approvalStyles, /\.approval-button[^}]+white-space:\s*nowrap/su);
  assert.match(approvalCard, /data-testid="approval-card"/u);
  assert.match(approvalCard, /data-approval-action-type/u);
  assert.match(approvalCard, /data-testid="approval-accept"/u);
  assert.match(eventHandler, /case "run\.started":[\s\S]+runError\.value = undefined/u);
  assert.match(eventHandler, /case "message\.delta":[\s\S]{0,240}?return;/u);
  assert.match(eventHandler, /case "assistant\.notice":[\s\S]{0,240}?messages\.push/u);
  assert.doesNotMatch(eventHandler, /streamingText\.value \+= event\.text/u);
  assert.match(
    resumeStyle,
    /\.resume-document-bullet-text\s*\{[^}]*text-align:\s*justify;[^}]*text-align-last:\s*auto;[^}]*text-justify:\s*inter-character;/su,
  );
});

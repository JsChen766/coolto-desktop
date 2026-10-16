import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildMatchReportResumeInstruction } from "../src/job-assets/match-report-resume-instruction.js";

test("match report resume instruction names the job without technical IDs", () => {
  const text = buildMatchReportResumeInstruction("最终状态回归");
  assert.equal(text, "请基于当前匹配报告，为岗位「最终状态回归」生成针对性一页简历。");
  assert.doesNotMatch(text, /reportId|jdId|019fa/i);
});

test("match report panel exposes a single generate CTA", async () => {
  const [panel, workspace] = await Promise.all([
    readFile(new URL("../src/desktop/renderer/src/components/MatchReportPanel.vue", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/renderer/src/app/AppChatWorkspace.vue", import.meta.url), "utf8"),
  ]);
  assert.match(panel, /基于此报告生成简历/u);
  assert.match(panel, /data\.expired/u);
  assert.match(workspace, /buildMatchReportResumeInstruction/u);
  assert.doesNotMatch(workspace, /MatchReportCard[\s\S]*基于此报告生成简历/u);
});

test("settings profile pane shows always-on-top and an AI provider pane", async () => {
  const source = await readFile(
    new URL("../src/desktop/renderer/src/components/SettingsDialog.vue", import.meta.url),
    "utf8",
  );
  assert.match(source, /窗口置顶/u);
  assert.match(source, /setAlwaysOnTop/u);
  assert.match(source, /AiProviderSettings/u);
  assert.match(source, /activeNav === 'ai'/u);
});

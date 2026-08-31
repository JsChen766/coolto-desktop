import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resumeDraftProgressLabel } from
  "../src/desktop/renderer/src/resume-workspace/resume-draft-status.js";

test("draft status distinguishes incomplete, material, and ready states", () => {
  assert.equal(resumeDraftProgressLabel({
    workspaceStatus: "needs_user_decision",
    generationReady: false,
  }), "等待补充材料");
  assert.equal(resumeDraftProgressLabel({
    workspaceStatus: "writing",
    generationReady: false,
  }), "生成未完成");
  assert.equal(resumeDraftProgressLabel({
    workspaceStatus: "ready_for_approval",
    generationReady: true,
  }), "");
});

test("draft cards and repository rows render the mechanical status", async () => {
  const [card, panel, sidebar, row] = await Promise.all([
    source("../src/desktop/renderer/src/components/ResumeArtifactCard.vue"),
    source("../src/desktop/renderer/src/components/ArtifactPanel.vue"),
    source("../src/desktop/renderer/src/components/Sidebar.vue"),
    source("../src/desktop/renderer/src/components/ResumeLibraryRow.vue"),
  ]);
  for (const value of [card, panel, sidebar, row]) {
    assert.match(value, /resumeDraftProgressLabel/u);
  }
});

function source(relative: string): Promise<string> {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

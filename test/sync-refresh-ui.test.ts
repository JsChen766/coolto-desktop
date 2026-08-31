import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { desktopErrorMessage } from
  "../src/desktop/renderer/src/chat/desktop-error-message.js";

test("background sync completion reloads the experience projection", async () => {
  const [runtime, preload, library] = await Promise.all([
    source("../src/desktop/main/sync/sync-runtime.ts"),
    source("../src/desktop/preload/index.ts"),
    source("../src/desktop/renderer/src/experiences/use-experience-library.ts"),
  ]);
  assert.match(runtime, /finally[\s\S]+#listeners/u);
  assert.match(preload, /sync:completed/u);
  assert.match(library, /onSyncCompleted[\s\S]+load\(selectedId\.value\)/u);
});

test("resume IPC failures become user-facing messages", () => {
  assert.equal(
    desktopErrorMessage(
      "resume-drafts:export-pdf Refusing to print an unqualified resume candidate",
    ),
    "当前简历尚未通过生成门槛，请先继续完善。",
  );
  assert.equal(
    desktopErrorMessage("resume-drafts:export-pdf candidateId=secret revisionId=12"),
    "操作未完成，请重新打开当前内容后再试。",
  );
});

test("leaving resume context clears operation errors", async () => {
  const [workspace, preview] = await Promise.all([
    source("../src/desktop/renderer/src/resume-workspace/use-resume-workspace.ts"),
    source("../src/desktop/renderer/src/app/use-resume-library-preview.ts"),
  ]);
  assert.match(workspace, /desktopErrorMessage/u);
  assert.match(preview, /resetResumePreview[\s\S]+clearLocalError/u);
});

function source(relative: string): Promise<string> {
  return readFile(new URL(relative, import.meta.url), "utf8");
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(name: string): Promise<string> {
  return readFile(new URL(`../src/desktop/renderer/src/${name}`, import.meta.url), "utf8");
}

test("privacy dialogs keep destructive states keyboard reachable", async () => {
  const [exportDialog, deletionDialog, section] = await Promise.all([
    source("components/DataExportDialog.vue"),
    source("components/AccountDeletionDialog.vue"),
    source("components/PrivacyDataSection.vue"),
  ]);
  for (const dialog of [exportDialog, deletionDialog]) {
    assert.match(dialog, /aria-modal="true"/u);
    assert.match(dialog, /focusable\.at\(-1\)/u);
    assert.match(dialog, /event\.shiftKey/u);
    assert.match(dialog, /event\.preventDefault\(\)/u);
    assert.match(dialog, /event\.stopPropagation\(\)/u);
  }
  assert.match(exportDialog, /privacy-export-description/u);
  assert.match(deletionDialog, /delete-account-warning/u);
  assert.match(deletionDialog, /third-party|外部/u);
  assert.match(section, /partial_failure/u);
  assert.match(section, /blocked/u);
  assert.match(section, /exportTrigger/u);
  assert.match(section, /deletionTrigger/u);
  assert.match(section, /nextTick/u);
});
test("privacy UI keeps demo and unavailable APIs fail-closed", async () => {
  const [demo, unavailable] = await Promise.all([
    readFile(new URL("../src/desktop/renderer/src/lib/demo/browser-demo-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/desktop/renderer/src/lib/unavailable-desktop-api.ts", import.meta.url), "utf8"),
  ]);
  assert.match(demo, /Browser Demo 不执行真实数据导出/u);
  assert.match(demo, /Browser Demo 不执行真实账号删除/u);
  assert.match(demo, /Browser Demo 不执行真实本地清除/u);
  assert.match(unavailable, /桌面安全桥接加载失败/u);
});

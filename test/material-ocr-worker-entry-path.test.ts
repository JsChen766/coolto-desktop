import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import test from "node:test";

import { resolveMaterialOcrWorkerEntryPath } from "../src/desktop/main/material/material-ocr-worker-path.js";

const WIN_APP = "C:\\Users\\student\\AppData\\Local\\Programs\\Coolto\\resources\\app.asar";
const WIN_CWD = "D:\\Coolto";
const MAC_APP = "/Applications/Coolto.app/Contents/Resources/app.asar";
const MAC_CWD = "/Users/student/Coolto";

test("packaged OCR worker resolves inside app.asar/out/main where files: out/** ships it", () => {
  const appPath = join("resources", "app.asar");
  const packaged = resolveMaterialOcrWorkerEntryPath({ isPackaged: true, appPath, cwd: "unused" });
  assert.equal(packaged, join(appPath, "out", "main", "material-ocr-worker.cjs"));
  assert.notEqual(packaged, join(appPath, "material-ocr-worker.cjs"));
});

test("development OCR worker keeps resolving from cwd/out/main", () => {
  const cwd = join("repo", "Coolto");
  const dev = resolveMaterialOcrWorkerEntryPath({ isPackaged: false, appPath: "unused", cwd });
  assert.equal(dev, join(cwd, "out", "main", "material-ocr-worker.cjs"));
});

test("Windows NSIS layout points at the asar-internal bundle", () => {
  const packaged = resolveMaterialOcrWorkerEntryPath({
    isPackaged: true, appPath: WIN_APP, cwd: WIN_CWD, pathApi: win32,
  });
  assert.equal(packaged, `${WIN_APP}\\out\\main\\material-ocr-worker.cjs`);
  assert.notEqual(packaged, `${WIN_APP}\\material-ocr-worker.cjs`);
  assert.equal(
    resolveMaterialOcrWorkerEntryPath({ isPackaged: false, appPath: WIN_APP, cwd: WIN_CWD, pathApi: win32 }),
    "D:\\Coolto\\out\\main\\material-ocr-worker.cjs",
  );
});

test("macOS dmg layout points at the asar-internal bundle", () => {
  const packaged = resolveMaterialOcrWorkerEntryPath({
    isPackaged: true, appPath: MAC_APP, cwd: MAC_CWD, pathApi: posix,
  });
  assert.equal(packaged, `${MAC_APP}/out/main/material-ocr-worker.cjs`);
  assert.notEqual(packaged, `${MAC_APP}/material-ocr-worker.cjs`);
  assert.equal(
    resolveMaterialOcrWorkerEntryPath({ isPackaged: false, appPath: MAC_APP, cwd: MAC_CWD, pathApi: posix }),
    "/Users/student/Coolto/out/main/material-ocr-worker.cjs",
  );
});

test("packaged worker never escapes app.asar to the resources root", () => {
  for (const [appPath, pathApi] of [[WIN_APP, win32], [MAC_APP, posix]] as const) {
    const packaged = resolveMaterialOcrWorkerEntryPath({ isPackaged: true, appPath, cwd: "unused", pathApi });
    assert.ok(packaged.startsWith(appPath + pathApi.sep), packaged);
    assert.notEqual(packaged, pathApi.join(pathApi.dirname(appPath), "material-ocr-worker.cjs"));
  }
});

test("electron-builder ships the worker via out/** and keeps OCR language resources", async () => {
  const builder = await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");
  assert.match(builder, /files:\s*\r?\n\s*- out\/\*\*\/\*/u);
  assert.doesNotMatch(builder, /from:\s*out\/main\/material-ocr-worker\.cjs/u);
  assert.match(builder, /- from: build\/material-ocr\s*\r?\n\s*to: material-ocr/u);
});

test("material host feeds Electron app paths into the pure resolver", async () => {
  const host = await readFile(
    new URL("../src/desktop/main/material/open-material-user-host.ts", import.meta.url), "utf8",
  );
  assert.match(host, /resolveMaterialOcrWorkerEntryPath\(\{\s*isPackaged: app\.isPackaged,\s*appPath: app\.getAppPath\(\),\s*cwd: process\.cwd\(\),?\s*\}\)/u);
});

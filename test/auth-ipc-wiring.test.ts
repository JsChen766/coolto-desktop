import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop IPC passes the BrowserWindow to auth sync notifications", async () => {
  const source = await readFile(new URL(
    "../src/desktop/main/ipc.ts", import.meta.url,
  ), "utf8");
  assert.match(
    source,
    /registerAuthIpc\(\s*ipcMain,\s*window,\s*auth,/u,
  );
});

test("Windows release smoke rejects blank renderers and unhandled rejections", async () => {
  const source = await readFile(new URL(
    "../scripts/verify-windows-installer.mjs", import.meta.url,
  ), "utf8");
  assert.match(source, /target\.url\?\.startsWith\("file:"\)/u);
  assert.match(source, /UnhandledPromiseRejection/u);
  assert.match(source, /fatalStderr/u);
  const unpacked = await readFile(new URL(
    "../scripts/verify-windows-unpacked.mjs", import.meta.url,
  ), "utf8");
  assert.match(unpacked, /target\.url\?\.startsWith\("file:"\)/u);
  assert.match(unpacked, /fatalStderr/u);
});

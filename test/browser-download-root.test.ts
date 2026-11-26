import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, win32 } from "node:path";
import test from "node:test";

import {
  ensureBrowserDownloadRoot,
  resolveBrowserDownloadRoot,
  type BrowserDownloadPathName,
} from "../src/desktop/main/browser/browser-download-root.js";

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "coolto-download-root-"));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function errno(code: string): Error {
  return Object.assign(new Error(`${code}: simulated`), { code });
}

test("download root uses the OS Downloads folder when it resolves", () => {
  const asked: BrowserDownloadPathName[] = [];
  const root = resolveBrowserDownloadRoot((name) => {
    asked.push(name);
    return name === "downloads" ? "/Users/u/Downloads" : "/Users/u/Library/Coolto";
  });
  assert.equal(root, "/Users/u/Downloads");
  assert.deepEqual(asked, ["downloads"]);
});

test("download root falls back to userData/downloads when Electron cannot resolve Downloads", () => {
  const userData = join(tmpdir(), "Coolto");
  const root = resolveBrowserDownloadRoot((name) => {
    if (name === "downloads") throw new Error("Failed to get 'downloads' path");
    return userData;
  });
  assert.equal(root, join(userData, "downloads"));
});

test("download root honours the QA override before asking Electron", () => {
  const root = resolveBrowserDownloadRoot(() => {
    throw new Error("getPath must not be called when an override is set");
  }, "/qa/downloads");
  assert.equal(root, "/qa/downloads");
});

test("download root ignores an empty override", () => {
  const root = resolveBrowserDownloadRoot(() => "/home/u/Downloads", "");
  assert.equal(root, "/home/u/Downloads");
});

test("ensureBrowserDownloadRoot swallows ENOENT/EPERM instead of aborting startup", () => {
  for (const code of ["ENOENT", "EPERM", "EACCES"]) {
    const attempted: string[] = [];
    const ok = ensureBrowserDownloadRoot("E:\\Downloads", (path) => {
      attempted.push(path);
      throw errno(code);
    });
    assert.equal(ok, false, code);
    assert.deepEqual(attempted, ["E:\\Downloads"]);
  }
});

test("ensureBrowserDownloadRoot creates a missing nested folder", () => {
  withTempDir((dir) => {
    const root = join(dir, "nested", "Downloads");
    assert.equal(ensureBrowserDownloadRoot(root), true);
    assert.equal(statSync(root).isDirectory(), true);
    assert.equal(ensureBrowserDownloadRoot(root), true, "existing folder is fine");
  });
});

test("ensureBrowserDownloadRoot returns false for a dangling Downloads junction/symlink", () => {
  withTempDir((dir) => {
    const root = join(dir, "Downloads");
    // "junction" needs no privilege on Windows; the type is ignored on macOS/Linux.
    symlinkSync(join(dir, "unmounted-volume", "Downloads"), root, "junction");
    assert.doesNotThrow(() => ensureBrowserDownloadRoot(root));
    assert.equal(ensureBrowserDownloadRoot(root), false);
  });
});

test("ensureBrowserDownloadRoot returns false when a file blocks the path", () => {
  withTempDir((dir) => {
    const blocker = join(dir, "not-a-folder");
    writeFileSync(blocker, "x");
    assert.equal(ensureBrowserDownloadRoot(join(blocker, "Downloads")), false);
  });
});

test("ensureBrowserDownloadRoot returns false for a missing Windows drive", {
  skip: process.platform !== "win32" && "drive letters exist only on Windows",
}, () => {
  const letter = [..."ZYXWVUTSRQPONMLKJIHG"].find((candidate) => !existsSync(`${candidate}:/`));
  if (!letter) return;
  assert.equal(ensureBrowserDownloadRoot(win32.join(`${letter}:\\`, "Downloads")), false);
});

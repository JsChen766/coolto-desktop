import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  closePromptAbortsQuit,
  resolveWindowCloseAction,
} from "../src/desktop/main/window-close-policy.js";

test("only a quit prompt that ends without quitting aborts the quit attempt", () => {
  assert.equal(closePromptAbortsQuit("quit", "cancel"), true);
  assert.equal(closePromptAbortsQuit("quit", "save-failed"), true);
  assert.equal(closePromptAbortsQuit("quit", "save"), false);
  assert.equal(closePromptAbortsQuit("quit", "discard"), false);
  for (const outcome of ["save", "discard", "cancel", "save-failed"] as const) {
    assert.equal(closePromptAbortsQuit("hide", outcome), false, outcome);
  }
});

test("after an aborted quit the close button hides to the tray again", () => {
  // cancelQuit() clears the shell's quitting flag, so the guard sees quitting=false.
  assert.equal(resolveWindowCloseAction({
    forceClose: false, quitting: false, draftState: "saved",
  }), "hide");
  assert.equal(resolveWindowCloseAction({
    forceClose: false, quitting: false, draftState: "idle",
  }), "hide");
  assert.equal(resolveWindowCloseAction({
    forceClose: false, quitting: false, draftState: "dirty",
  }), "prompt-hide");
  assert.equal(resolveWindowCloseAction({
    forceClose: false, quitting: false, draftState: "error",
  }), "prompt-hide");
});

test("the close guard resets shell and quit-flush state when a quit is aborted", async () => {
  const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");
  const [ipc, quitFlush, shell, guard] = await Promise.all([
    read("../src/desktop/main/ipc.ts"),
    read("../src/desktop/main/quit-flush.ts"),
    read("../src/desktop/main/desktop-window-shell.ts"),
    read("../src/desktop/main/window-close-guard.ts"),
  ]);
  assert.match(
    ipc,
    /new WindowCloseGuard\([^\n]*isQuitting\(\)[^\n]*windowShell\.cancelQuit\(\)/u,
  );
  assert.match(quitFlush, /export function resetQuitFlush\(\): void \{/u);
  assert.match(quitFlush, /^let flushed = false;$/mu);
  assert.match(shell, /cancelQuit: \(\) => \{\s+quitting = false;\s+resetQuitFlush\(\);/u);
  assert.match(guard, /closePromptAbortsQuit\(mode, "cancel"\)\) this\.onQuitAborted\(\)/u);
  assert.match(guard, /closePromptAbortsQuit\(mode, "save-failed"\)/u);
});

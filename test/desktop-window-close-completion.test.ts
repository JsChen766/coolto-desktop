import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { resolveCloseCompletion } from "../src/desktop/main/window-close-policy.js";

test("a hide prompt completes by hiding; a quit prompt re-issues app.quit()", () => {
  assert.equal(resolveCloseCompletion("hide"), "hide");
  assert.equal(resolveCloseCompletion("quit"), "quit-app");
  assert.equal(resolveCloseCompletion(undefined), "quit-app");
});

test("the close guard quits the app instead of only closing the window", async () => {
  const guard = await readFile(
    new URL("../src/desktop/main/window-close-guard.ts", import.meta.url),
    "utf8",
  );
  // window.close() alone leaves macOS running windowless after "...并退出".
  assert.doesNotMatch(guard, /forceClose = true;\s+this\.window\.close\(\)/u);
  assert.match(guard, /resolveCloseCompletion\(mode\) === "hide"/u);
  assert.match(guard, /this\.forceClose = true;\s+this\.quitApp\(\);/u);
  assert.match(guard, /quitApp: \(\) => void = \(\) => app\.quit\(\)/u);
});

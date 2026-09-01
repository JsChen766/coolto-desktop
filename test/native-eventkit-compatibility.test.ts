import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canUseNativeEventKit } from
  "../src/calendar/native-eventkit-compatibility.js";

test("native EventKit stays disabled when the Intel app runs through Rosetta", () => {
  assert.equal(canUseNativeEventKit("darwin", true), false);
});

test("native EventKit remains available on native macOS architectures only", () => {
  assert.equal(canUseNativeEventKit("darwin", false), true);
  assert.equal(canUseNativeEventKit("win32", false), false);
  assert.equal(canUseNativeEventKit("linux", false), false);
});

test("the Electron adapter checks Rosetta before resolving the native binding", async () => {
  const source = await readFile(new URL(
    "../src/desktop/main/calendar/native-eventkit-adapter.ts",
    import.meta.url,
  ), "utf8");
  assert.match(source, /if \(!nativeEventKitAvailable\(\)\) return "unavailable"/u);
  assert.match(source,
    /canUseNativeEventKit\(process\.platform, app\.runningUnderARM64Translation\)/u);
});

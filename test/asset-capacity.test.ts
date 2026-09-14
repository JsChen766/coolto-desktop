import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ACTIVE_EXPERIENCES,
  MAX_ACTIVE_RESUMES,
  assertAssetCapacity,
  countLiveAssets,
} from "../src/desktop/main/asset-capacity.js";
import { parseDesktopShellPrefs } from "../src/desktop/main/desktop-shell-prefs.js";

test("live asset count skips tombstones and archived rows", () => {
  assert.equal(countLiveAssets([
    { operation: "upsert", payload: { status: "active" } },
    { operation: "delete", payload: { status: "active" } },
    { operation: "upsert", payload: { status: "archived" } },
    { operation: "upsert", payload: { status: "published" } },
  ]), 2);
});

test("asset capacity blocks at PRD limits", () => {
  assert.doesNotThrow(() => assertAssetCapacity("experience", MAX_ACTIVE_EXPERIENCES - 1));
  assert.throws(
    () => assertAssetCapacity("experience", MAX_ACTIVE_EXPERIENCES),
    /经历已达上限 200/,
  );
  assert.throws(
    () => assertAssetCapacity("resume", MAX_ACTIVE_RESUMES),
    /云端简历已达上限 100/,
  );
});

test("desktop shell prefs default always-on-top off", () => {
  assert.deepEqual(parseDesktopShellPrefs(undefined), { alwaysOnTop: false });
  assert.deepEqual(parseDesktopShellPrefs({ alwaysOnTop: true }), { alwaysOnTop: true });
  assert.deepEqual(parseDesktopShellPrefs({ alwaysOnTop: "yes" }), { alwaysOnTop: false });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  browserTabFocusAfterClose,
  moveBrowserTabFocus,
  resolveBrowserTabRovingId,
  shouldShowBrowserTabOverflow,
} from "../src/browser/browser-tab-roving.js";

const TAB_IDS = ["tab-a", "tab-b", "tab-c"] as const;

test("tab focus wraps and supports first and last navigation", () => {
  assert.equal(moveBrowserTabFocus(TAB_IDS, "tab-a", "previous"), "tab-c");
  assert.equal(moveBrowserTabFocus(TAB_IDS, "tab-c", "next"), "tab-a");
  assert.equal(moveBrowserTabFocus(TAB_IDS, "tab-b", "first"), "tab-a");
  assert.equal(moveBrowserTabFocus(TAB_IDS, "tab-b", "last"), "tab-c");
});

test("tab focus recovers predictably when the current tab is missing", () => {
  assert.equal(moveBrowserTabFocus(TAB_IDS, "missing", "next"), "tab-a");
  assert.equal(moveBrowserTabFocus(TAB_IDS, "missing", "previous"), "tab-c");
  assert.equal(moveBrowserTabFocus([], null, "next"), null);
});

test("closing a tab prefers its right neighbor and then its left neighbor", () => {
  assert.equal(browserTabFocusAfterClose(TAB_IDS, "tab-b"), "tab-c");
  assert.equal(browserTabFocusAfterClose(TAB_IDS, "tab-c"), "tab-b");
  assert.equal(browserTabFocusAfterClose(["tab-a"], "tab-a"), null);
});

test("roving focus keeps a valid preference before falling back to active", () => {
  assert.equal(
    resolveBrowserTabRovingId(TAB_IDS, "tab-b", "tab-a"),
    "tab-b",
  );
  assert.equal(
    resolveBrowserTabRovingId(TAB_IDS, "missing", "tab-c"),
    "tab-c",
  );
  assert.equal(resolveBrowserTabRovingId(TAB_IDS, null, null), "tab-a");
  assert.equal(resolveBrowserTabRovingId([], null, null), null);
});

test("overflow controls can disappear after their reserved width no longer matters", () => {
  assert.equal(shouldShowBrowserTabOverflow(501, 500, false), false);
  assert.equal(shouldShowBrowserTabOverflow(503, 500, false), true);
  assert.equal(shouldShowBrowserTabOverflow(460, 448, true), false);
  assert.equal(shouldShowBrowserTabOverflow(503, 448, true), true);
});

import assert from "node:assert/strict";
import test from "node:test";

import { ELEMENT_HELPERS_SCRIPT } from
  "../src/desktop/main/browser/browser-element-scripts.js";

test("fill-id lookup compares exact attributes without selector interpolation", () => {
  assert.match(ELEMENT_HELPERS_SCRIPT,
    /getAttribute\('data-fill-id'\) === expected/u);
  assert.doesNotMatch(ELEMENT_HELPERS_SCRIPT,
    /querySelector\('\[data-fill-id="' \+/u);
  assert.doesNotThrow(() => Function(ELEMENT_HELPERS_SCRIPT));
});

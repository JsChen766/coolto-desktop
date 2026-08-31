import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_ZOOM_FACTORS,
  browserZoomPercent,
  normalizeBrowserZoomFactor,
  stepBrowserZoomFactor,
} from "../src/browser/browser-zoom.js";

test("browser zoom follows the Chrome-like ladder in both directions", () => {
  assert.equal(stepBrowserZoomFactor(1, "in"), 1.1);
  assert.equal(stepBrowserZoomFactor(1, "out"), 0.9);
  assert.equal(stepBrowserZoomFactor(1.2, "in"), 1.25);
  assert.equal(stepBrowserZoomFactor(1.2, "out"), 1.1);
  assert.equal(stepBrowserZoomFactor(Number.NaN, "in"), 1.1);
});

test("browser zoom clamps at 25 and 500 percent", () => {
  assert.equal(BROWSER_ZOOM_FACTORS[0], 0.25);
  assert.equal(BROWSER_ZOOM_FACTORS.at(-1), 5);
  assert.equal(stepBrowserZoomFactor(0.25, "out"), 0.25);
  assert.equal(stepBrowserZoomFactor(5, "in"), 5);
});

test("browser zoom normalization and labels use supported factors", () => {
  assert.equal(normalizeBrowserZoomFactor(1.19), 1.25);
  assert.equal(normalizeBrowserZoomFactor(1.17), 1.1);
  assert.equal(normalizeBrowserZoomFactor(Number.POSITIVE_INFINITY), 1);
  assert.equal(browserZoomPercent(1.24), 125);
});

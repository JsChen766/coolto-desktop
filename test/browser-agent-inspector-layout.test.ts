import assert from "node:assert/strict";
import test from "node:test";

import {
  browserChromeHeightDip,
  resolveBrowserAgentInspectorLayout,
  type BrowserAgentInspectorLayoutInput,
} from "../src/browser/browser-agent-inspector-layout.js";

const BASE: BrowserAgentInspectorLayoutInput = {
  windowWidthDip: 1180,
  windowHeightDip: 820,
  shellZoomFactor: 1,
  chromeHeight: 90,
  open: true,
};

test("inspector floats at a stable 380 CSS pixel visual width", () => {
  assert.deepEqual(resolveBrowserAgentInspectorLayout(BASE), {
    mode: "overlay",
    panelBounds: { x: 780, y: 94, width: 396, height: 722 },
    pageRightInset: 0,
  });
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 1099,
  }), {
    mode: "overlay",
    panelBounds: { x: 699, y: 94, width: 396, height: 722 },
    pageRightInset: 0,
  });
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 940,
  }), {
    mode: "overlay",
    panelBounds: { x: 540, y: 94, width: 396, height: 722 },
    pageRightInset: 0,
  });
});

test("inspector keeps narrow windows full-width without shrinking the page", () => {
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 939,
  }), {
    mode: "overlay",
    panelBounds: { x: 539, y: 94, width: 396, height: 722 },
    pageRightInset: 0,
  });
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 300,
  }), {
    mode: "overlay",
    panelBounds: { x: 0, y: 90, width: 300, height: 730 },
    pageRightInset: 0,
  });
});

test("shell zoom selects by CSS viewport and converts bounds back to DIP", () => {
  assert.equal(browserChromeHeightDip(90, 2), 180);
  assert.equal(browserChromeHeightDip(90, Number.NaN), 0);
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 720,
    windowHeightDip: 520,
    shellZoomFactor: 2,
  }), {
    mode: "overlay",
    panelBounds: { x: 0, y: 90, width: 720, height: 430 },
    pageRightInset: 0,
  });
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 2200,
    shellZoomFactor: 2,
  }), {
    mode: "overlay",
    panelBounds: { x: 1400, y: 98, width: 792, height: 714 },
    pageRightInset: 0,
  });
});

test("closed and invalid layouts fail closed while bounded values clamp", () => {
  for (const input of [
    { ...BASE, open: false },
    { ...BASE, windowWidthDip: Number.NaN },
    { ...BASE, windowHeightDip: 0 },
    { ...BASE, shellZoomFactor: Number.POSITIVE_INFINITY },
    { ...BASE, shellZoomFactor: 0 },
    { ...BASE, chromeHeight: Number.NaN },
    { ...BASE, chromeHeight: BASE.windowHeightDip },
  ]) {
    assert.deepEqual(resolveBrowserAgentInspectorLayout(input), {
      mode: "closed",
      panelBounds: null,
      pageRightInset: 0,
    });
  }

  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    shellZoomFactor: 100,
    chromeHeight: -20,
  }), {
    mode: "overlay",
    panelBounds: { x: 0, y: 0, width: 1180, height: 820 },
    pageRightInset: 0,
  });
});

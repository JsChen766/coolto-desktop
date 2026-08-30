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

test("inspector uses 360 and 320 CSS pixel docked layouts", () => {
  assert.deepEqual(resolveBrowserAgentInspectorLayout(BASE), {
    mode: "docked",
    panelBounds: { x: 820, y: 90, width: 360, height: 730 },
    pageRightInset: 360,
  });
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 1099,
  }), {
    mode: "docked",
    panelBounds: { x: 779, y: 90, width: 320, height: 730 },
    pageRightInset: 320,
  });
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 940,
  }), {
    mode: "docked",
    panelBounds: { x: 620, y: 90, width: 320, height: 730 },
    pageRightInset: 320,
  });
});

test("inspector overlays at 939 CSS pixels and never shrinks the page", () => {
  assert.deepEqual(resolveBrowserAgentInspectorLayout({
    ...BASE,
    windowWidthDip: 939,
  }), {
    mode: "overlay",
    panelBounds: { x: 579, y: 90, width: 360, height: 730 },
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
    mode: "docked",
    panelBounds: { x: 1480, y: 90, width: 720, height: 730 },
    pageRightInset: 720,
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

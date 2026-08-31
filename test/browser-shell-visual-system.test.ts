import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const renderer = new URL("../src/desktop/renderer/src/", import.meta.url);

test("Browser Shell uses the approved monochrome source palette", async () => {
  const tokens = await source("styles/tokens.css");
  assert.match(tokens, /--browser-white: #fbfbfa/u);
  assert.match(tokens, /--browser-black: #1b1b19/u);
  assert.match(tokens, /--browser-gray: #8a8a86/u);

  const browserSources = await Promise.all([
    source("browser-shell/BrowserAgentCapsule.vue"),
    source("browser-shell/BrowserNavigationProgress.vue"),
    source("browser-shell/BrowserWindowControls.vue"),
    readFile(new URL(
      "../src/desktop/main/browser/browser-home-page.ts", import.meta.url,
    ), "utf8"),
  ]);
  assert.doesNotMatch(browserSources.join("\n"),
    /#(?:356fca|78a7f5|8a5a00|e2b65f|2f7650|78c596|e5484d|c68a24)/iu);
});

test("Inspector controls stay on one row and reuse the App scrollbar", async () => {
  const [controls, inspector, scrollbar] = await Promise.all([
    source("browser-shell/BrowserAgentControlBar.vue"),
    source("browser-shell/BrowserAgentInspector.vue"),
    source("styles/app-scrollbar.css"),
  ]);
  assert.match(controls, /\.control-actions[^}]*flex-wrap: nowrap/su);
  assert.doesNotMatch(controls, /primary-controls|secondary-controls/u);
  assert.match(inspector, /inspector-content app-scrollbar/u);
  assert.match(scrollbar, /\.app-scrollbar::-webkit-scrollbar[^}]*width: 5px/su);
  assert.match(scrollbar, /background: transparent/u);
});

function source(path: string): Promise<string> {
  return readFile(new URL(path, renderer), "utf8");
}

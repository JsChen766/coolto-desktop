import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserTabFaviconState,
  MAX_BROWSER_FAVICON_ORIGINS,
} from "../src/browser/browser-tab-favicon.js";

test("favicon state restores a known origin after an intervening failure", () => {
  const favicon = new BrowserTabFaviconState();
  favicon.update("http://fixture.test/a", ["http://fixture.test/favicon.svg"]);
  assert.equal(favicon.get(), "http://fixture.test/favicon.svg");

  favicon.startNavigation("http://fixture.test/a", "https://other.test/");
  assert.equal(favicon.get(), null);
  favicon.clearForFailure();
  favicon.startNavigation("data:text/html,error", "http://fixture.test/b");
  assert.equal(favicon.get(), "http://fixture.test/favicon.svg");
});

test("favicon state does not carry icons across unknown origins", () => {
  const favicon = new BrowserTabFaviconState();
  favicon.update("https://one.test/", ["https://one.test/icon.png"]);
  favicon.startNavigation("https://one.test/", "https://two.test/");
  assert.equal(favicon.get(), null);
  favicon.update("https://two.test/", []);
  favicon.startNavigation("https://three.test/", "https://two.test/next");
  assert.equal(favicon.get(), null);
});

test("favicon origin cache evicts the least recently used origin", () => {
  const favicon = new BrowserTabFaviconState();
  for (let index = 0; index < MAX_BROWSER_FAVICON_ORIGINS; index += 1) {
    favicon.update(`https://site-${index}.test/`, [
      `https://site-${index}.test/icon.png`,
    ]);
  }
  favicon.startNavigation("https://unknown.test/", "https://site-0.test/return");
  assert.equal(favicon.get(), "https://site-0.test/icon.png");
  favicon.update(`https://site-${MAX_BROWSER_FAVICON_ORIGINS}.test/`, [
    `https://site-${MAX_BROWSER_FAVICON_ORIGINS}.test/icon.png`,
  ]);
  favicon.startNavigation("https://unknown.test/", "https://site-1.test/return");
  assert.equal(favicon.get(), null);
  favicon.startNavigation("https://unknown.test/", "https://site-0.test/again");
  assert.equal(favicon.get(), "https://site-0.test/icon.png");
  favicon.startNavigation("https://unknown.test/", `https://site-${MAX_BROWSER_FAVICON_ORIGINS}.test/return`);
  assert.equal(favicon.get(),
    `https://site-${MAX_BROWSER_FAVICON_ORIGINS}.test/icon.png`);
});

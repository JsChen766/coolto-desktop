import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BROWSER_NAVIGATION_URL_LENGTH,
  normalizeBrowserNavigationUrl,
} from "../src/browser/browser-navigation-url.js";

test("browser navigation accepts only bounded credential-free HTTP(S) URLs", () => {
  assert.equal(normalizeBrowserNavigationUrl(" https://example.com/path "),
    "https://example.com/path");
  assert.equal(normalizeBrowserNavigationUrl("http://127.0.0.1:8080/"),
    "http://127.0.0.1:8080/");
  assert.equal(normalizeBrowserNavigationUrl("https://user:secret@example.com"), null);
  assert.equal(normalizeBrowserNavigationUrl("data:text/html,unsafe"), null);
  assert.equal(normalizeBrowserNavigationUrl("file:///tmp/unsafe"), null);
  assert.equal(normalizeBrowserNavigationUrl("javascript:alert(1)"), null);
  assert.equal(normalizeBrowserNavigationUrl(
    `https://example.com/${"x".repeat(MAX_BROWSER_NAVIGATION_URL_LENGTH)}`,
  ), null);
});

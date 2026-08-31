import assert from "node:assert/strict";
import test from "node:test";

import {
  browserNavigationFailure,
  browserNavigationFailureRecord,
  sanitizeFaviconUrl,
  shouldResetBrowserFavicon,
} from "../src/browser/browser-tab-presentation.js";

test("favicon projection allows bounded web images and rejects executable schemes", () => {
  assert.equal(
    sanitizeFaviconUrl("https://jobs.example/favicon.ico"),
    "https://jobs.example/favicon.ico",
  );
  assert.match(sanitizeFaviconUrl("data:image/png;base64,AAAA") ?? "", /^data:image\/png/u);
  assert.equal(sanitizeFaviconUrl("data:image/svg+xml,<svg></svg>"), null);
  assert.equal(sanitizeFaviconUrl("javascript:alert(1)"), null);
  assert.equal(sanitizeFaviconUrl("file:///tmp/favicon.ico"), null);
});

test("same-origin navigation retains favicon until Chromium reports a replacement", () => {
  assert.equal(shouldResetBrowserFavicon(
    "https://jobs.example/a", "https://jobs.example/b",
  ), false);
  assert.equal(shouldResetBrowserFavicon(
    "https://jobs.example/a", "https://other.example/b",
  ), true);
  assert.equal(shouldResetBrowserFavicon("data:text/html,a", "data:text/html,b"), true);
});

test("navigation failure bounds diagnostics and redacts embedded passwords", () => {
  const failure = browserNavigationFailure(
    -105,
    `ERR_NAME_NOT_RESOLVED ${"x".repeat(400)}`,
    "https://user:secret@jobs.example:8443/apply",
  );
  assert.equal(failure.code, -105);
  assert.equal(failure.description.length, 300);
  assert.doesNotMatch(failure.url, /secret/u);
  assert.match(failure.url, /user:.*@jobs\.example:8443/u);
});

test("navigation failure keeps an exact private retry URL beyond display bounds", () => {
  const url = `https://example.com/path?value=${"x".repeat(5_000)}`;
  const record = browserNavigationFailureRecord(-102, "ERR_CONNECTION_REFUSED", url);
  assert.equal(record.failure.url.length, 4_096);
  assert.equal(record.retryUrl, url);
});

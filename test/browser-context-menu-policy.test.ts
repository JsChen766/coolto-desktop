import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_BROWSER_CONTEXT_LINK_LENGTH,
  canCopyBrowserContextSelection,
  deriveBrowserContextMenuPolicy,
  safeBrowserContextLinkUrl,
} from "../src/browser/browser-context-menu-policy.js";

test("context links accept bounded HTTP and HTTPS URLs", () => {
  assert.equal(
    safeBrowserContextLinkUrl(" https://jobs.example/apply?q=frontend "),
    "https://jobs.example/apply?q=frontend",
  );
  assert.equal(
    safeBrowserContextLinkUrl("http://jobs.example/path"),
    "http://jobs.example/path",
  );
  const policy = deriveBrowserContextMenuPolicy({
    linkURL: "https://jobs.example/apply",
  });
  assert.equal(policy.canCopyLink, true);
  assert.equal(policy.canOpenLinkInNewTab, true);
  assert.equal(policy.linkUrl, "https://jobs.example/apply");
});

test("context links reject executable, local, credentialed and oversized targets", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "file:///tmp/private.txt",
    "https://user:secret@jobs.example/apply",
    "https://jobs.example/\napply",
    "not a url",
    `https://jobs.example/${"x".repeat(MAX_BROWSER_CONTEXT_LINK_LENGTH)}`,
  ]) {
    assert.equal(safeBrowserContextLinkUrl(value), null, value);
  }
});

test("selection copy follows Chromium capability but never exposes password fields", () => {
  assert.equal(canCopyBrowserContextSelection({
    selectionText: "selected text",
    formControlType: "input-text",
    editFlags: { canCopy: true },
  }), true);
  assert.equal(canCopyBrowserContextSelection({
    selectionText: "secret",
    formControlType: "input-password",
    editFlags: { canCopy: true },
  }), false);
  assert.equal(canCopyBrowserContextSelection({
    selectionText: "selected text",
    editFlags: { canCopy: false },
  }), false);
  assert.equal(canCopyBrowserContextSelection({
    selectionText: "",
    editFlags: { canCopy: true },
  }), false);
});

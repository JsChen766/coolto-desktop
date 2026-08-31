import assert from "node:assert/strict";
import test from "node:test";

import {
  browserErrorTitle,
  browserErrorUrl,
  isBrowserErrorUrl,
  isBrowserInternalUrl,
} from "../src/desktop/main/browser/browser-error-page.js";
import {
  browserHomeUrl,
  browserHomeTaskKey,
  isBrowserHomeActionUrl,
  isBrowserHomeUrl,
} from "../src/desktop/main/browser/browser-home-page.js";

const INTERNAL_TOKEN = "test-tab-token";

test("home page follows theme and locale without the old ghost-card treatment", () => {
  const light = decodeDataPage(browserHomeUrl("light", "zh-CN", INTERNAL_TOKEN));
  const dark = decodeDataPage(browserHomeUrl("dark", "en-US", INTERNAL_TOKEN));
  assert.match(light, /Coolto 浏览器/u);
  assert.match(light, /border-radius: 26px/u);
  assert.doesNotMatch(light, /999px|18px 50px/u);
  assert.match(dark, /color-scheme: dark/u);
  assert.match(dark, /Coolto Browser/u);
  assert.match(dark, /Search or enter a web address/u);
  assert.doesNotMatch(light, /autofocus/u);
  assert.match(light, /\.task-time \{ color: #626260/u);
  assert.doesNotMatch(light, /#356fca|#c68a24|#8a5a00/u);
  const homeUrl = browserHomeUrl("dark", "en-US", INTERNAL_TOKEN);
  assert.equal(isBrowserHomeUrl(homeUrl, INTERNAL_TOKEN), true);
  assert.equal(isBrowserHomeUrl(homeUrl, "other-tab"), false);
  assert.equal(isBrowserHomeUrl(
    "data:text/html,<h1>phish</h1>#coolto-browser-home", INTERNAL_TOKEN,
  ), false);
});

test("home task refresh key ignores timestamp-only projection changes", () => {
  const task = {
    goal: "Keep focus",
    state: "active" as const,
    updatedAt: "2026-08-31T01:00:00.000Z",
    waitingItems: [] as string[],
  };
  assert.equal(
    browserHomeTaskKey(task),
    browserHomeTaskKey({ ...task, updatedAt: "2026-08-31T01:01:00.000Z" }),
  );
  assert.notEqual(
    browserHomeTaskKey(task),
    browserHomeTaskKey({ ...task, state: "waiting" }),
  );
});

test("home page renders a bounded escaped task snapshot and a tab-bound action", () => {
  const url = browserHomeUrl("dark", "en-US", INTERNAL_TOKEN, {
    goal: "Apply to <unsafe> & verify",
    state: "waiting",
    updatedAt: "2026-08-31T01:02:00.000Z",
    waitingItems: ["等待你确认", "等待你回答", "等待你交还控制", "extra"],
  });
  const html = decodeDataPage(url);
  assert.match(html, /Needs your attention/u);
  assert.match(html, /Apply to &lt;unsafe&gt; &amp; verify/u);
  assert.match(html, /Complete the pending approval/u);
  assert.match(html, /Answer Agent/u);
  assert.match(html, /Return control to Agent/u);
  assert.doesNotMatch(html, />extra</u);
  const action = /href="([^"]*coolto-browser-action[^"]*)"/u.exec(html)?.[1];
  assert.ok(action);
  assert.equal(isBrowserHomeActionUrl(action, INTERNAL_TOKEN), true);
  assert.equal(isBrowserHomeActionUrl(action, "other-tab"), false);
});

test("error page is local, themed, escaped and offers real recovery targets", () => {
  const url = browserErrorUrl({
    failure: {
      code: -105,
      description: "ERR_NAME_NOT_RESOLVED <unsafe>",
      url: "https://missing.example/?a=1&b=2",
    },
    internalToken: INTERNAL_TOKEN,
    locale: "zh-CN",
    retryUrl: "https://missing.example/?a=1&b=2",
    theme: "dark",
  });
  const html = decodeDataPage(url);
  assert.equal(isBrowserErrorUrl(url, INTERNAL_TOKEN), true);
  assert.equal(isBrowserInternalUrl(url, INTERNAL_TOKEN), true);
  assert.equal(isBrowserInternalUrl(url, "other-tab"), false);
  assert.match(html, /找不到这个站点/u);
  assert.match(html, /color-scheme: dark/u);
  assert.match(html, /ERR_NAME_NOT_RESOLVED &lt;unsafe&gt;/u);
  assert.match(html, /重试页面/u);
  assert.equal(browserErrorTitle("en-US"), "Page unavailable");
});

test("error page retry link preserves the exact private navigation URL", () => {
  const retryUrl = `https://missing.example/path?value=${"x".repeat(5_000)}`;
  const html = decodeDataPage(browserErrorUrl({
    failure: { code: -102, description: "failed", url: "https://missing.example/" },
    internalToken: INTERNAL_TOKEN,
    locale: "en-US",
    retryUrl,
    theme: "light",
  }));
  assert.equal(/<a class="primary" href="([^"]+)"/u.exec(html)?.[1], retryUrl);
});

function decodeDataPage(url: string): string {
  const start = url.indexOf(",") + 1;
  const end = url.lastIndexOf("#coolto-browser-");
  return decodeURIComponent(url.slice(start, end));
}

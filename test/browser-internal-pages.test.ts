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
  isBrowserHomeUrl,
} from "../src/desktop/main/browser/browser-home-page.js";

test("home page follows theme and locale without the old ghost-card treatment", () => {
  const light = decodeDataPage(browserHomeUrl("light", "zh-CN"));
  const dark = decodeDataPage(browserHomeUrl("dark", "en-US"));
  assert.match(light, /Coolto 浏览器/u);
  assert.match(light, /border-radius: 12px/u);
  assert.doesNotMatch(light, /999px|18px 50px/u);
  assert.match(dark, /color-scheme: dark/u);
  assert.match(dark, /Coolto Browser/u);
  assert.match(dark, /Search or enter a web address/u);
  assert.equal(isBrowserHomeUrl(browserHomeUrl("dark", "en-US")), true);
});

test("error page is local, themed, escaped and offers real recovery targets", () => {
  const url = browserErrorUrl({
    failure: {
      code: -105,
      description: "ERR_NAME_NOT_RESOLVED <unsafe>",
      url: "https://missing.example/?a=1&b=2",
    },
    locale: "zh-CN",
    theme: "dark",
  });
  const html = decodeDataPage(url);
  assert.equal(isBrowserErrorUrl(url), true);
  assert.equal(isBrowserInternalUrl(url), true);
  assert.match(html, /找不到这个站点/u);
  assert.match(html, /color-scheme: dark/u);
  assert.match(html, /ERR_NAME_NOT_RESOLVED &lt;unsafe&gt;/u);
  assert.match(html, /重试页面/u);
  assert.equal(browserErrorTitle("en-US"), "Page unavailable");
});

function decodeDataPage(url: string): string {
  const start = url.indexOf(",") + 1;
  const end = url.lastIndexOf("#coolto-browser-");
  return decodeURIComponent(url.slice(start, end));
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  browserHomeUrl,
  isBrowserHomeUrl,
} from "../src/desktop/main/browser/browser-home-page.js";

test("only the exact Coolto browser home data URL is presented as home", () => {
  const token = "home-page-test";
  assert.equal(isBrowserHomeUrl(browserHomeUrl("dark", "zh-CN", token), token), true);
  assert.equal(
    isBrowserHomeUrl(
      "data:text/html;charset=UTF-8,%3Ctitle%3ECoolto%20%E7%A4%BA%E4%BE%8B%3C%2Ftitle%3E",
      token,
    ),
    false,
  );
});

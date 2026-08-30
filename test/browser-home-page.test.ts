import assert from "node:assert/strict";
import test from "node:test";

import {
  BROWSER_HOME_URL,
  isBrowserHomeUrl,
} from "../src/desktop/main/browser/browser-home-page.js";

test("only the exact Coolto browser home data URL is presented as home", () => {
  assert.equal(isBrowserHomeUrl(BROWSER_HOME_URL), true);
  assert.equal(
    isBrowserHomeUrl("data:text/html;charset=UTF-8,%3Ctitle%3ECoolto%20%E7%A4%BA%E4%BE%8B%3C%2Ftitle%3E"),
    false,
  );
});

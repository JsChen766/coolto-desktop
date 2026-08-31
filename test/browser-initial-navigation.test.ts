import assert from "node:assert/strict";
import test from "node:test";

import { browserInitialNavigationUrl } from
  "../src/desktop/main/browser/browser-initial-navigation.js";

const HOME_URL = "data:text/html;charset=utf-8,home";
const ONBOARDING_URL =
  "data:text/html;charset=UTF-8,%3Ctitle%3ECoolto%20%E7%A4%BA%E4%BE%8B%E7%94%B3%E8%AF%B7%3C%2Ftitle%3E";

test("host internal HTML bypasses only the external navigation allowlist", () => {
  assert.equal(
    browserInitialNavigationUrl(ONBOARDING_URL, HOME_URL, "host-internal"),
    ONBOARDING_URL,
  );
  assert.equal(
    browserInitialNavigationUrl(ONBOARDING_URL, HOME_URL, "external"),
    HOME_URL,
  );
  assert.throws(
    () => browserInitialNavigationUrl("data:text/plain,unsafe", HOME_URL, "host-internal"),
    /宿主内部页面地址无效/u,
  );
});

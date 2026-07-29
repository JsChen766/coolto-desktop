import assert from "node:assert/strict";
import test from "node:test";

import { buildBrowserUserAgent } from "../src/desktop/main/browser/browser-user-agent.js";

test("browser UA matches the bundled Chromium major without Electron tokens", () => {
  const userAgent = buildBrowserUserAgent({
    chromeVersion: "150.0.7871.129",
    platform: "darwin",
  });

  assert.equal(
    userAgent,
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
      "AppleWebKit/537.36 (KHTML, like Gecko) " +
      "Chrome/150.0.0.0 Safari/537.36",
  );
  assert.doesNotMatch(userAgent, /Electron|coolto-local-agent/u);
});

test("browser UA uses stable desktop platform tokens", () => {
  assert.match(
    buildBrowserUserAgent({
      chromeVersion: "150",
      platform: "win32",
    }),
    /\(Windows NT 10\.0; Win64; x64\)/u,
  );
  assert.match(
    buildBrowserUserAgent({
      chromeVersion: "150.1",
      platform: "linux",
    }),
    /\(X11; Linux x86_64\)/u,
  );
});

test("browser UA rejects an unknown Chromium version", () => {
  assert.throws(
    () =>
      buildBrowserUserAgent({
        chromeVersion: "unknown",
        platform: "darwin",
      }),
    /无法识别 Chromium 版本/u,
  );
});

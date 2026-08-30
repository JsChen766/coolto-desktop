import assert from "node:assert/strict";
import test from "node:test";

import { BrowserWindowPresentation } from
  "../src/desktop/main/browser/browser-window-presentation.js";

test("Browser presentation keeps the App locale when Shell ready has no override", () => {
  const presentation = new BrowserWindowPresentation();
  assert.equal(presentation.apply({ locale: "en-US", theme: "dark" }), true);
  assert.equal(presentation.locale, "en-US");
  assert.equal(presentation.theme, "dark");
  assert.equal(presentation.setLocale(undefined), false);
  assert.equal(presentation.locale, "en-US");
});

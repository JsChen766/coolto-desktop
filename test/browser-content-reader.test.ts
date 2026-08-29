import assert from "node:assert/strict";
import test from "node:test";

import { composeSnapshotText } from
  "../src/desktop/main/browser/browser-content-reader.js";

test("multi-frame snapshots cannot starve a mail body frame", () => {
  const value = composeSnapshotText([
    "M".repeat(20_000),
    "COOLTO-BE5-163-20260829-A",
  ], 20_000);
  assert.equal(value.truncated, true);
  assert.match(value.text, /COOLTO-BE5-163-20260829-A/u);
  assert.ok(value.text.startsWith("M".repeat(100)));
  assert.ok(value.text.length <= 20_000);
});

test("single-frame snapshot text remains unchanged under budget", () => {
  assert.deepEqual(composeSnapshotText(["visible mail"], 20_000), {
    text: "visible mail",
    truncated: false,
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { BrowserFillLog } from
  "../src/desktop/main/browser/browser-fill-log.js";

test("fill log retains the first value and latest write for review", () => {
  const log = new BrowserFillLog();
  log.record("field-1", {
    elementType: "input", label: "Name",
    valueBefore: "Before", valueAfter: "First",
  });
  log.record("field-1", {
    elementType: "input", label: "Full name",
    valueBefore: "First", valueAfter: "Second",
  });
  const records = log.list();
  assert.equal(records.length, 1);
  assert.equal(records[0]?.valueBefore, "Before");
  assert.equal(records[0]?.valueAfter, "Second");
  assert.equal(records[0]?.label, "Full name");
  log.clear();
  assert.equal(log.hasEntries, false);
});

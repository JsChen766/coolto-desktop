import assert from "node:assert/strict";
import test from "node:test";

import { BrowserWriteAccessGate } from
  "../src/desktop/main/browser/browser-write-access-gate.js";

test("reviewing blocks new page writes until the user finishes the batch", () => {
  const gate = new BrowserWriteAccessGate();
  gate.grant("confirmed delegation", "tab-1", "https://jobs.example");
  assert.deepEqual(gate.check("tab-1", "https://jobs.example"), { ok: true });
  gate.setReviewing(true);
  const blocked = gate.check("tab-1", "https://jobs.example");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.message, /等待用户.*审核/u);
  gate.setReviewing(false);
  assert.deepEqual(gate.check("tab-1", "https://jobs.example"), { ok: true });
});

test("tab switching is temporary but origin drift revokes page access", () => {
  const gate = new BrowserWriteAccessGate();
  gate.grant("confirmed delegation", "tab-1", "https://jobs.example");
  assert.equal(gate.check("tab-2", "https://jobs.example").ok, false);
  assert.equal(gate.isGranted(), true);
  assert.equal(gate.check("tab-1", "https://jobs.example").ok, true);
  gate.onOriginChanged("tab-1", "https://other.example");
  assert.equal(gate.isGranted(), false);
  assert.equal(gate.snapshot().reviewing, false);
});

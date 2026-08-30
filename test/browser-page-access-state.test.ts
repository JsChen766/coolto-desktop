import assert from "node:assert/strict";
import test from "node:test";

import { BrowserPageAccessState } from
  "../src/desktop/main/browser/browser-page-access-state.js";
import { BrowserWriteAccessGate } from
  "../src/desktop/main/browser/browser-write-access-gate.js";

test("page access state notifies safely and closes derived state on revoke", () => {
  const gate = new BrowserWriteAccessGate();
  gate.grant("delegation", "tab-1", "https://jobs.example");
  let cleared = 0;
  let revoked = 0;
  let changes = 0;
  const state = new BrowserPageAccessState(
    gate, () => { cleared += 1; }, () => { revoked += 1; },
  );
  state.subscribe(() => { throw new Error("projection failed"); });
  state.subscribe(() => { changes += 1; });
  state.changed();
  assert.equal(changes, 1);
  assert.equal(state.check("tab-1", "https://other.example").ok, false);
  assert.equal(gate.isGranted(), false);
  assert.equal(cleared, 1);
  assert.equal(revoked, 1);
  assert.equal(changes, 2);
});

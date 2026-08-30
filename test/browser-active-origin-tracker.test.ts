import assert from "node:assert/strict";
import test from "node:test";

import { BrowserActiveOriginTracker } from
  "../src/desktop/main/browser/browser-active-tab.js";
import type { BrowserTabManager } from
  "../src/desktop/main/browser/browser-tab-manager.js";
import { BrowserWriteAccessGate } from
  "../src/desktop/main/browser/browser-write-access-gate.js";

test("closing the authorized tab revokes access and notifies the host", () => {
  const gate = new BrowserWriteAccessGate();
  gate.grant("delegation", "tab-1", "https://jobs.example");
  let revoked = 0;
  const tracker = new BrowserActiveOriginTracker(gate, () => { revoked += 1; });
  let activeId = "tab-1";
  let tabOneExists = true;
  const tabs = fakeTabs(
    () => activeId,
    (id) => id !== "tab-1" || tabOneExists,
  );
  assert.equal(tracker.sync(tabs), true);
  activeId = "tab-2";
  assert.equal(tracker.sync(tabs), true);
  assert.equal(gate.isGranted(), true);
  tabOneExists = false;
  assert.equal(tracker.sync(tabs), true);
  assert.equal(gate.isGranted(), false);
  assert.equal(revoked, 1);
});

test("authorized-tab origin drift revokes access once", () => {
  const gate = new BrowserWriteAccessGate();
  gate.grant("delegation", "tab-1", "https://jobs.example");
  let origin = "https://jobs.example/path";
  let revoked = 0;
  const tracker = new BrowserActiveOriginTracker(gate, () => { revoked += 1; });
  const tabs = fakeTabs(() => "tab-1", () => true, () => origin);
  tracker.sync(tabs);
  origin = "https://other.example/path";
  assert.equal(tracker.sync(tabs), true);
  assert.equal(gate.isGranted(), false);
  assert.equal(revoked, 1);
  assert.equal(tracker.sync(tabs), false);
});

function fakeTabs(
  activeId: () => string,
  exists: (id: string) => boolean,
  url: () => string = () => "https://jobs.example/path",
): BrowserTabManager {
  const tab = (id: string) => exists(id) ? {
    id,
    view: { webContents: { getURL: url } },
  } : undefined;
  return {
    activeTab: () => tab(activeId()),
    tab,
  } as unknown as BrowserTabManager;
}

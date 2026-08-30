import assert from "node:assert/strict";
import test from "node:test";

import { BrowserTabZoomController } from "../src/desktop/main/browser/browser-tab-zoom.js";

class FakeZoomContents {
  readonly applied: number[] = [];
  destroyed = false;

  public isDestroyed(): boolean { return this.destroyed; }
  public setZoomFactor(factor: number): void { this.applied.push(factor); }
}

test("saved zoom is only applied while the tab is active", () => {
  const contents = new FakeZoomContents();
  let changes = 0;
  const zoom = new BrowserTabZoomController(contents, () => { changes += 1; });

  zoom.change("in");
  assert.equal(zoom.getFactor(), 1.1);
  assert.deepEqual(contents.applied, []);

  zoom.onNavigation();
  assert.deepEqual(contents.applied, []);

  zoom.setActive(true);
  assert.deepEqual(contents.applied, [1.1]);
  zoom.onNavigation();
  assert.deepEqual(contents.applied, [1.1, 1.1]);

  zoom.setActive(false);
  zoom.change("in");
  assert.equal(zoom.getFactor(), 1.25);
  assert.deepEqual(contents.applied, [1.1, 1.1]);
  assert.equal(changes, 2);
});

test("reset restores the saved default and destroyed contents are ignored", () => {
  const contents = new FakeZoomContents();
  const zoom = new BrowserTabZoomController(contents, () => {});

  zoom.setActive(true);
  zoom.change("in");
  zoom.change("reset");
  assert.equal(zoom.getFactor(), 1);
  assert.deepEqual(contents.applied, [1, 1.1, 1]);

  contents.destroyed = true;
  zoom.change("out");
  assert.equal(zoom.getFactor(), 0.9);
  assert.deepEqual(contents.applied, [1, 1.1, 1]);
});

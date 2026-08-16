import assert from "node:assert/strict";
import test from "node:test";

import {
  MinimalDOMMatrix,
  ensurePdfEnvironment,
} from "../src/files/pdfjs-environment.js";

test("ensurePdfEnvironment is idempotent and installs DOMMatrix", async () => {
  const globals = globalThis as Record<string, unknown>;
  const installed = globals.DOMMatrix;
  await ensurePdfEnvironment();
  assert.equal(typeof globals.DOMMatrix, "function");
  await ensurePdfEnvironment();
  assert.equal(globals.DOMMatrix, installed ?? globals.DOMMatrix);
});

test("matrix inverse restores transformPoint (2D affine)", () => {
  const matrix = new MinimalDOMMatrix([2, 0.5, -1, 3, 100, 200]);
  const inverted = new MinimalDOMMatrix(matrix);
  inverted.invertSelf();
  const point = { x: 37, y: 19 };
  const roundTrip = matrix.multiply(inverted).transformPoint(point);
  assert.ok(Math.abs(roundTrip.x - point.x) < 1e-9, `x=${roundTrip.x}`);
  assert.ok(Math.abs(roundTrip.y - point.y) < 1e-9, `y=${roundTrip.y}`);
});

test("translate/scale/rotate produce expected transforms", () => {
  const matrix = new MinimalDOMMatrix();
  assert.deepEqual(
    matrix.translate(10, 20).transformPoint({ x: 1, y: 1 }),
    { x: 11, y: 21 },
  );
  assert.deepEqual(matrix.scale(2, 3).transformPoint({ x: 1, y: 1 }), {
    x: 2,
    y: 3,
  });
  const rotated = matrix.rotate(90).transformPoint({ x: 1, y: 0 });
  assert.ok(Math.abs(rotated.x) < 1e-9);
  assert.ok(Math.abs(rotated.y - 1) < 1e-9);
});

test("multiplySelf mutates in place per DOMMatrix semantics", () => {
  const left = new MinimalDOMMatrix([1, 0, 0, 1, 5, 5]);
  const right = new MinimalDOMMatrix([2, 0, 0, 2, 0, 0]);
  left.multiplySelf(right);
  assert.deepEqual(left.transformPoint({ x: 1, y: 1 }), { x: 7, y: 7 });
});

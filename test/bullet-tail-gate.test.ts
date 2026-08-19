import assert from "node:assert/strict";
import test from "node:test";

import { passesBulletTailGate } from
  "../src/resume/bullet-tail-gate.js";

test("tail gate accepts a last line short by at most one CJK glyph", () => {
  assert.equal(passesBulletTailGate({
    lastLineWidthPx: 407,
    availableLineWidthPx: 600,
    gateRatio: 0.7,
    glyphTolerancePx: 13,
  }), true);
});

test("tail gate still rejects a last line short by more than one CJK glyph", () => {
  assert.equal(passesBulletTailGate({
    lastLineWidthPx: 406.9,
    availableLineWidthPx: 600,
    gateRatio: 0.7,
    glyphTolerancePx: 13,
  }), false);
});

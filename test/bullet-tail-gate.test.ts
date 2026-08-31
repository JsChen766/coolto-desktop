import assert from "node:assert/strict";
import test from "node:test";

import { passesBulletTailGate } from
  "../src/resume/bullet-tail-gate.js";
import {
  RESUME_TAIL_POLICY_V1,
  RESUME_TAIL_POLICY_V2,
} from "../src/resume/tail-policy.js";

test("V2 tail gate accepts only the one-pixel geometry tolerance", () => {
  assert.equal(passesBulletTailGate({
    lastLineWidthPx: 399,
    availableLineWidthPx: 600,
    policy: RESUME_TAIL_POLICY_V2,
  }), true);
  assert.equal(passesBulletTailGate({
    lastLineWidthPx: 398.99,
    availableLineWidthPx: 600,
    policy: RESUME_TAIL_POLICY_V2,
  }), false);
});

test("a document without V2 keeps the legacy one-glyph tolerance", () => {
  assert.equal(passesBulletTailGate({
    lastLineWidthPx: 407,
    availableLineWidthPx: 600,
    policy: RESUME_TAIL_POLICY_V1,
    fontSizePx: 13,
  }), true);
});

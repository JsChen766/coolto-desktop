import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTailRepairRetryState,
  tailRepairOptionFingerprint,
  type TailRepairAttemptRecord,
} from "../src/resume/workspace/tail-repair-state.js";

test("tail retry guidance preserves real geometry for every unresolved bullet", () => {
  const state = buildTailRepairRetryState(undefined, [
    attempt("a", { lineDelta: 1, lastLineRatio: 0.22 }),
    attempt("b", { lineDelta: 0, lastLineRatio: 0.64 }),
  ], { minimum: 0, maximum: 2 });

  assert.deepEqual(new Set(state.bulletIds), new Set(["a", "b"]));
  assert.equal(state.guidanceByBulletId.a?.mode, "new_line_short");
  assert.equal(state.guidanceByBulletId.b?.mode, "same_line_short");
  assert.ok(
    state.guidanceByBulletId.b?.additionalCharacterTargets?.minimum,
  );
});

test("tail retry guidance distinguishes page capacity and line overflow", () => {
  const page = buildTailRepairRetryState(undefined, [attempt("a", {
    eligible: true,
    tailPassed: true,
    lastLineRatio: 0.8,
    lineDelta: 1,
  })], { minimum: 0, maximum: 0 });
  assert.equal(page.guidanceByBulletId.a?.mode, "page_capacity");

  const overflow = buildTailRepairRetryState(undefined, [attempt("a", {
    lineCount: 4,
    withinLineLimit: false,
  })], { minimum: 0, maximum: 2 });
  assert.equal(overflow.guidanceByBulletId.a?.mode, "too_many_lines");
});

test("tail option fingerprints normalize equivalent candidate text", () => {
  assert.equal(
    tailRepairOptionFingerprint("ＡＢＣ  "),
    tailRepairOptionFingerprint("ABC"),
  );
});

function attempt(
  bulletId: string,
  changes: Partial<TailRepairAttemptRecord> = {},
): TailRepairAttemptRecord {
  return {
    bulletId,
    optionFingerprint: `${bulletId}-candidate`,
    kind: "grounded_rewrite",
    characterCount: 80,
    lineCount: 2,
    lineDelta: 0,
    lastLineWidthPx: 360,
    availableLineWidthPx: 600,
    lastLineRatio: 0.6,
    tailPassed: false,
    withinLineLimit: true,
    eligible: false,
    ...changes,
  };
}

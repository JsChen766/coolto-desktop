import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeCompileResult } from "../src/resume/compiler-types.js";
import {
  compileObservationState,
  maxReachableUsageRatioForRuntime,
  terminalContinuationFor,
} from "../src/resume/workspace/runtime-acceptance-contract.js";
import { createReadySaveFixture } from "./support/resume-save-fixture.js";

function compileFixture(): ResumeCompileResult {
  return {
    templateId: "resume-standard",
    profileVersion: "fixture/v1",
    profileHash: "fixture-profile",
    qualified: false,
    fontsReady: true,
    loadedFontFamilies: ["SimSun"],
    observedAt: "2026-09-08T00:00:00.000Z",
    viewport: { widthPx: 1280, heightPx: 900, devicePixelRatio: 1 },
    pageCount: 1,
    overflowPx: 0,
    usedHeightPx: 400,
    availableHeightPx: 1000,
    bodyLineHeightPx: 20,
    bodyFontSizePx: 14,
    usageRatio: 0.4,
    effectiveTargetBand: { minimum: 0.92, target: 0.95, maximum: 0.98 },
    bullets: [],
    violations: [{ code: "page_underfilled", message: "underfilled" }],
  };
}

test("missing and stale compile observations fail closed", () => {
  assert.equal(compileObservationState(4, undefined), "missing");
  assert.equal(compileObservationState(4, 3), "stale");
  assert.equal(compileObservationState(4, 4), "current");
});

test("physical reachability only expands existing bullets", () => {
  const result = compileFixture();
  assert.equal(maxReachableUsageRatioForRuntime(result, 3), 0.4);
  const expanded = {
    ...result,
    bullets: [{
      bulletId: "b1",
      lineCount: 1,
      lastLineWidthPx: 100,
      availableLineWidthPx: 600,
      lastLineRatio: 1 / 6,
      fontSizePx: 14,
      ceuPx: 14,
      noWrapTextWidthPx: 100,
      noWrapTextCjk: 8,
      tailPolicyVersion: "resume-tail-v2" as const,
      tailProbe: {
        styleSignature: "fixture",
        separatorText: "，",
        separatorWidthPx: 14,
        hardCjk: 10,
        minCjk: 10,
        idealCjk: 12,
        maxCjk: 16,
        wrapRisk: "low" as const,
      },
      passed: false,
    }],
  };
  assert.equal(maxReachableUsageRatioForRuntime(expanded, 3), 0.44);
});

test("terminal continuation is visible but never exposes internals", () => {
  for (const kind of ["ready_for_approval", "needs_user_decision", "stopped", "failed"] as const) {
    const continuation = terminalContinuationFor(kind);
    assert.equal(continuation.visible, true);
    assert.equal(continuation.continueAutomatically, false);
    assert.ok(continuation.text.length > 0);
    assert.doesNotMatch(continuation.text, /candidate|revision|tool|guard|nextAction|workspace|blocker/iu);
  }
});

test("terminal continuation remains user-facing for a current ready workspace", async () => {
  const { ready } = await createReadySaveFixture();
  const continuation = terminalContinuationFor(ready.status === "ready_for_approval"
    ? "ready_for_approval"
    : "failed");
  assert.equal(continuation.visible, true);
  assert.equal(continuation.continueAutomatically, false);
});

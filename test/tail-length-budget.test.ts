import assert from "node:assert/strict";
import test from "node:test";

import type { ResumeBulletMeasurement } from
  "../src/resume/compiler-types.js";
import { RESUME_TAIL_POLICY_V2 } from "../src/resume/tail-policy.js";
import { buildTailLengthBudget } from
  "../src/resume/workspace/tail-length-budget.js";
import { semanticTailRewriteInstruction } from
  "../src/resume/workspace/semantic-tail-rewrite-instruction.js";

test("CEU budget uses the renderer probe and keeps the separator separate", () => {
  const budget = buildTailLengthBudget(measurement({
    hardCjk: 8,
    minCjk: 9,
    idealCjk: 11,
    maxCjk: 15,
  }), RESUME_TAIL_POLICY_V2);
  assert.ok(budget);
  assert.equal(budget.minimumGrowthCjk, 9);
  assert.equal(budget.idealGrowthCjk, 11);
  assert.equal(budget.maximumGrowthCjk, 15);
  assert.equal(budget.currentTextCjk, 80);
  assert.equal(budget.minimumFinalCjk, 95);
  assert.equal(budget.idealFinalCjk, 97);
  assert.equal(budget.maximumFinalCjk, 99);
  assert.equal(budget.compactIdealCjk, 37);
  assert.equal(budget.recommendedMode, "clause");
  assert.equal(budget.separatorText, "，");
  const retryInstruction = semanticTailRewriteInstruction({
    ...budget,
    currentRatio: 0.64,
  });
  assert.match(retryInstruction, /保留当前工作基线/u);
  assert.match(retryInstruction, /最小语义增补/u);
});

test("an unreachable or high-risk same-line probe routes directly to reflow", () => {
  const unreachable = buildTailLengthBudget(measurement({
    hardCjk: null,
    minCjk: null,
    idealCjk: 18,
    maxCjk: null,
  }), RESUME_TAIL_POLICY_V2);
  assert.equal(unreachable?.recommendedMode, "reflow");
  const highRisk = buildTailLengthBudget({
    ...measurement({ hardCjk: 3, minCjk: 4, idealCjk: 4, maxCjk: 6 }),
    tailProbe: {
      ...measurement({ hardCjk: 3, minCjk: 4, idealCjk: 4, maxCjk: 6 })
        .tailProbe!,
      wrapRisk: "high",
    },
  }, RESUME_TAIL_POLICY_V2);
  assert.equal(highRisk?.recommendedMode, "reflow");
});

function measurement(
  probe: Pick<NonNullable<ResumeBulletMeasurement["tailProbe"]>,
    "hardCjk" | "minCjk" | "idealCjk" | "maxCjk">,
): ResumeBulletMeasurement {
  return {
    bulletId: "bullet-1",
    lineCount: 2,
    lastLineWidthPx: 350,
    availableLineWidthPx: 600,
    lastLineRatio: 350 / 600,
    ceuPx: 12,
    noWrapTextCjk: 80,
    tailPolicyVersion: "resume-tail-v2",
    passed: false,
    tailProbe: {
      styleSignature: "simsun-12",
      separatorText: "，",
      separatorWidthPx: 12,
      wrapRisk: "low",
      ...probe,
    },
  };
}

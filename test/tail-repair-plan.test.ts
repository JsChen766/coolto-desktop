import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseTailRepairPlan,
  type MeasuredTailRepairOption,
} from "../src/resume/workspace/tail-repair-plan.js";

test("v53 page geometry repairs all nine tails with bounded dynamic programming", () => {
  const failed = Array.from({ length: 9 }, (_, index) => `failed-${index + 1}`);
  const passing = Array.from({ length: 15 }, (_, index) => `passing-${index + 1}`);
  const bulletIds = [...failed, ...passing];
  const options = new Map(failed.map((bulletId, index) => [
    bulletId,
    [option(bulletId, index < 4 ? -1 : 1)],
  ]));
  const lengths = new Map(bulletIds.map((bulletId) => [bulletId, 72]));

  const plan = chooseTailRepairPlan(
    bulletIds,
    options,
    0,
    4,
    lengths,
    new Set(failed),
  );

  assert.equal(plan?.repairedCount, 9);
  assert.equal(plan?.totalLineDelta, 1);
  assert.equal(plan?.balanceCount, 0);
});

function option(
  bulletId: string,
  addedLines: number,
): MeasuredTailRepairOption {
  return {
    bulletId,
    optionIndex: 0,
    text: `${bulletId}-candidate`,
    kind: addedLines < 0 ? "compact" : "grounded_rewrite",
    addedLines,
    lastLineRatio: 0.8,
  };
}

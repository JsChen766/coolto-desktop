import assert from "node:assert/strict";
import test from "node:test";

import { attachRejectedLineExpansionAttempts } from
  "../src/resume/workspace/line-expansion-attempt-feedback.js";

test("page fill feedback remembers only rejected compact insertions", () => {
  const diagnostics = attachRejectedLineExpansionAttempts({
    phase: "page_fill",
    requestedTargetCount: 2,
    measuredRewriteCount: 2,
    appliedRewriteCount: 1,
    stackedProgressCount: 0,
    heightGrowthCount: 1,
    skippedRewriteCount: 1,
    feedback: [
      { bulletId: "bullet-1", status: "rejected", reason: "padding" },
      { bulletId: "bullet-2", status: "applied", progressType: "height_growth" },
    ],
  }, [
    {
      bulletId: "bullet-1",
      component: "result",
      placement: "append",
      insertText: "，并提升长期竞争力",
    },
    {
      bulletId: "bullet-2",
      component: "method",
      placement: "append",
      insertText: "，结合季度数据校准假设",
    },
  ]);

  assert.equal(
    diagnostics.feedback[0]?.rejectedInsertText,
    "，并提升长期竞争力",
  );
  assert.equal(diagnostics.feedback[1]?.rejectedInsertText, undefined);
});

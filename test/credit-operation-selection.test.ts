import assert from "node:assert/strict";
import test from "node:test";

import { selectCreditOperation } from "../src/desktop/main/credit-operation-selection.js";

test("JD actions map to their billable operation", () => {
  assert.equal(
    selectCreditOperation(
      {
        jdReference: { jdId: "jd-1", title: "JD", action: "generate" },
      },
      "match_analyze",
    ).operationType,
    "resume_generate",
  );
  assert.equal(
    selectCreditOperation(
      {
        jdReference: { jdId: "jd-1", title: "JD", action: "match" },
      },
      "resume_generate",
    ).operationType,
    "match_analyze",
  );
});

test("explicit pricing-test correlation overrides inference", () => {
  assert.deepEqual(
    selectCreditOperation(
      {
        resumeReference: {
          artifactId: "artifact-1",
          targetType: "resume",
          targetId: "resume-1",
          label: "Resume",
        },
        usageContext: {
          operationType: "experience_extract",
          scenarioRunId: "scenario-2",
          operationRunId: "operation-2",
        },
      },
      "match_analyze",
    ),
    {
      operationType: "experience_extract",
      scenarioRunId: "scenario-2",
      operationRunId: "operation-2",
    },
  );
});

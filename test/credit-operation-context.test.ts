import assert from "node:assert/strict";
import test from "node:test";

import { CreditOperationContext } from "../src/agent/credit-operation-context.js";

test("one operation shares run ids while each upstream request stays unique", () => {
  const ids = ["operation-generated", "request-1", "request-2"];
  const context = new CreditOperationContext(
    "match_analyze",
    () => ids.shift() ?? "unexpected-id",
  );

  context.begin({
    operationType: "resume_generate",
    scenarioRunId: "scenario-1",
  });

  assert.deepEqual(context.nextRequestMetadata(), {
    operationType: "resume_generate",
    scenarioRunId: "scenario-1",
    operationRunId: "operation-generated",
    requestId: "request-1",
  });
  assert.deepEqual(context.nextRequestMetadata(), {
    operationType: "resume_generate",
    scenarioRunId: "scenario-1",
    operationRunId: "operation-generated",
    requestId: "request-2",
  });
});

test("uses the configured scenario id when a UI operation does not provide one", () => {
  const ids = ["operation-generated", "request-1"];
  const context = new CreditOperationContext(
    "jd_parse",
    () => ids.shift() ?? "unexpected-id",
    "pricing-v1-p4-business-01",
  );

  context.begin();

  assert.deepEqual(context.nextRequestMetadata(), {
    operationType: "jd_parse",
    scenarioRunId: "pricing-v1-p4-business-01",
    operationRunId: "operation-generated",
    requestId: "request-1",
  });
});

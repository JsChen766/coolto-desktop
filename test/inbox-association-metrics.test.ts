import assert from "node:assert/strict";
import test from "node:test";

import {
  inboxAssociationMetrics,
  type InboxAssociationDecision,
} from "../src/inbox-signals/inbox-association-metrics.js";

test("association gate accepts a perfect 100-case diverse corpus", () => {
  const decisions = corpus();
  const metrics = inboxAssociationMetrics(decisions);
  assert.equal(metrics.gateEligible, true);
  assert.equal(metrics.exactAccuracy, 1);
  assert.equal(metrics.highConfidencePrecision, 1);
  assert.equal(metrics.passed, true);
});

test("association gate rejects a precision error and undersized samples", () => {
  const decisions = corpus();
  decisions[0] = { ...decisions[0]!, actualApplicationId: "wrong-a" };
  assert.equal(inboxAssociationMetrics(decisions).passed, false);
  assert.equal(inboxAssociationMetrics(decisions.slice(0, 99)).gateEligible, false);
});

test("association gate cannot be passed by abstaining on every case", () => {
  const decisions = corpus().map((item) => ({
    ...item,
    actualApplicationId: null,
    confidence: 20,
  }));
  const metrics = inboxAssociationMetrics(decisions);
  assert.equal(metrics.highConfidenceLinks, 0);
  assert.equal(metrics.linkableCoverage, 0);
  assert.equal(metrics.passed, false);
});

function corpus(): InboxAssociationDecision[] {
  return Array.from({ length: 100 }, (_, index) => {
    const expectedApplicationId = index < 80 ? `application-${index}` : null;
    return {
      caseId: `case-${index}`,
      provider: index < 50 ? "outlook" as const : "163" as const,
      expectedApplicationId,
      actualApplicationId: expectedApplicationId,
      confidence: expectedApplicationId ? 95 : 80,
    };
  });
}

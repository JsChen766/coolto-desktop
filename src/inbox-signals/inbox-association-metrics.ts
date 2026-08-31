export const INBOX_ASSOCIATION_HIGH_CONFIDENCE = 95;

export interface InboxAssociationDecision {
  caseId: string;
  provider: "outlook" | "163";
  expectedApplicationId: string | null;
  actualApplicationId: string | null;
  confidence: number | null;
}

export interface InboxAssociationMetrics {
  caseCount: number;
  exactMatches: number;
  exactAccuracy: number;
  highConfidenceLinks: number;
  correctHighConfidenceLinks: number;
  highConfidencePrecision: number;
  linkableCount: number;
  correctLinks: number;
  linkableCoverage: number;
  expectedNullCount: number;
  correctAbstentions: number;
  abstentionAccuracy: number;
  providerCounts: Record<"outlook" | "163", number>;
  gateEligible: boolean;
  passed: boolean;
}

export function inboxAssociationMetrics(
  decisions: InboxAssociationDecision[],
): InboxAssociationMetrics {
  const exactMatches = decisions.filter((item) =>
    item.expectedApplicationId === item.actualApplicationId).length;
  const highConfidence = decisions.filter((item) =>
    item.actualApplicationId !== null &&
    (item.confidence ?? -1) >= INBOX_ASSOCIATION_HIGH_CONFIDENCE);
  const correctHighConfidenceLinks = highConfidence.filter((item) =>
    item.actualApplicationId === item.expectedApplicationId).length;
  const linkable = decisions.filter((item) => item.expectedApplicationId !== null);
  const correctLinks = linkable.filter((item) =>
    item.actualApplicationId === item.expectedApplicationId).length;
  const expectedNull = decisions.filter((item) => item.expectedApplicationId === null);
  const correctAbstentions = expectedNull.filter((item) =>
    item.actualApplicationId === null).length;
  const providerCounts = {
    outlook: decisions.filter((item) => item.provider === "outlook").length,
    163: decisions.filter((item) => item.provider === "163").length,
  };
  const gateEligible = decisions.length >= 100 &&
    providerCounts.outlook >= 40 && providerCounts[163] >= 40 &&
    expectedNull.length >= 20;
  const exactAccuracy = ratio(exactMatches, decisions.length);
  const highConfidencePrecision = ratio(
    correctHighConfidenceLinks, highConfidence.length,
  );
  return {
    caseCount: decisions.length,
    exactMatches,
    exactAccuracy,
    highConfidenceLinks: highConfidence.length,
    correctHighConfidenceLinks,
    highConfidencePrecision,
    linkableCount: linkable.length,
    correctLinks,
    linkableCoverage: ratio(correctLinks, linkable.length),
    expectedNullCount: expectedNull.length,
    correctAbstentions,
    abstentionAccuracy: ratio(correctAbstentions, expectedNull.length),
    providerCounts,
    gateEligible,
    passed: gateEligible && exactAccuracy >= 0.99 &&
      highConfidence.length > 0 && highConfidencePrecision >= 0.99,
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

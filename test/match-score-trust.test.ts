import assert from "node:assert/strict";
import test from "node:test";

import {
  MATCH_SCORER_VERSION,
  confidenceFromEvidence,
  presentMatchScore,
  resolveHostCoverage,
} from "../src/match/score-trust.js";

test("MATCH_SCORER_VERSION is 1.1 for OSS trust rules", () => {
  assert.equal(MATCH_SCORER_VERSION, "1.1");
});

test("resolveHostCoverage recomputes coverage from highlight requirement ids", () => {
  const result = resolveHostCoverage({
    requirementIds: ["req-1", "req-2", "req-3", "req-4"],
    highlights: [
      {
        requirementId: "req-1",
        evidence: [{ experienceId: "e", revisionId: "r", revisionContentHash: "h", sourceQuote: "quote" }],
      },
      {
        requirementId: "req-2",
        evidence: [{ experienceId: "e", revisionId: "r", revisionContentHash: "h", sourceQuote: "quote" }],
      },
    ],
    claimedCoverageRatio: 1,
    claimedEvidenceCompleteness: 1,
  });
  assert.equal(result.coverageRatio, 0.5);
  assert.equal(result.coveredRequirementCount, 2);
  assert.equal(result.totalRequirementCount, 4);
  assert.equal(result.evidenceCompleteness, 1);
});

test("resolveHostCoverage never adopts inflated claimed ratios", () => {
  const result = resolveHostCoverage({
    requirementIds: ["req-1", "req-2"],
    highlights: [
      {
        requirementId: "req-1",
        evidence: [{ experienceId: "e", revisionId: "r", revisionContentHash: "h", sourceQuote: "quote" }],
      },
    ],
    claimedCoverageRatio: 0.99,
    claimedEvidenceCompleteness: 1,
  });
  // 1 of 2 requirements covered → host 0.5; claim 0.99 is discarded.
  assert.equal(result.coverageRatio, 0.5);
  // All highlights have quotes → host 1; claim 1 is accepted.
  assert.equal(result.evidenceCompleteness, 1);
});

test("resolveHostCoverage keeps a lower honest claim", () => {
  const result = resolveHostCoverage({
    requirementIds: ["req-1"],
    highlights: [
      {
        requirementId: "req-1",
        evidence: [{ experienceId: "e", revisionId: "r", revisionContentHash: "h", sourceQuote: "quote" }],
      },
    ],
    claimedCoverageRatio: 0.8,
    claimedEvidenceCompleteness: 0.7,
  });
  assert.equal(result.coverageRatio, 0.8);
  assert.equal(result.evidenceCompleteness, 0.7);
});

test("resolveHostCoverage lowers evidence when highlights lack quotes", () => {
  const result = resolveHostCoverage({
    requirementIds: ["req-1", "req-2"],
    highlights: [
      {
        requirementId: "req-1",
        evidence: [{ experienceId: "e", revisionId: "r", revisionContentHash: "h", sourceQuote: "  " }],
      },
      {
        requirementId: "req-2",
        evidence: [{ experienceId: "e", revisionId: "r", revisionContentHash: "h", sourceQuote: "real" }],
      },
    ],
    claimedCoverageRatio: 1,
    claimedEvidenceCompleteness: 1,
  });
  assert.equal(result.evidenceCompleteness, 0.5);
  assert.equal(result.highlightsWithEvidence, 1);
});

test("resolveHostCoverage is zero evidence when JD has requirements but no highlights", () => {
  const result = resolveHostCoverage({
    requirementIds: ["req-1"],
    highlights: [],
    claimedCoverageRatio: 1,
    claimedEvidenceCompleteness: 1,
  });
  assert.equal(result.coverageRatio, 0);
  assert.equal(result.evidenceCompleteness, 0);
});

test("presentMatchScore degrades precision when evidence is incomplete", () => {
  assert.deepEqual(presentMatchScore(78.4, 0.9), { displayScore: 78.4, confidence: "high" });
  assert.deepEqual(presentMatchScore(78.4, 0.5), { displayScore: 78, confidence: "medium" });
  assert.deepEqual(presentMatchScore(78.4, 0.2), { displayScore: 80, confidence: "low" });
});

test("confidenceFromEvidence thresholds", () => {
  assert.equal(confidenceFromEvidence(0.75), "high");
  assert.equal(confidenceFromEvidence(0.4), "medium");
  assert.equal(confidenceFromEvidence(0.39), "low");
});

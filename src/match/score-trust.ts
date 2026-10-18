/**
 * Host-side trust helpers for MatchReport (§9).
 * Coverage and evidence completeness are recomputed locally so the model
 * cannot inflate them. Display precision is degraded when evidence is thin.
 */

import type { MatchHighlight } from "./types.js";

export const MATCH_SCORER_VERSION = "1.1";

/** Relative reference only — never a hiring probability. */
export const MATCH_SCORE_DISCLAIMER_ZH =
  "相对参考，非录用概率";

export type MatchScoreConfidence = "high" | "medium" | "low";

export interface HostCoverageInput {
  requirementIds: readonly string[];
  highlights: readonly Pick<MatchHighlight, "requirementId" | "evidence">[];
  /** Model-claimed ratios; host takes min(claim, computed) to block inflation. */
  claimedCoverageRatio: number;
  claimedEvidenceCompleteness: number;
}

export interface HostCoverageResult {
  coverageRatio: number;
  evidenceCompleteness: number;
  coveredRequirementCount: number;
  totalRequirementCount: number;
  highlightsWithEvidence: number;
  highlightCount: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Recompute coverage from JD requirement IDs vs highlight requirement IDs,
 * and evidence completeness from highlights that carry a non-empty quote.
 * Claimed values may only lower the host result, never raise it.
 */
export function resolveHostCoverage(input: HostCoverageInput): HostCoverageResult {
  const requirementSet = new Set(
    input.requirementIds.map((id) => id.trim()).filter(Boolean),
  );
  const totalRequirementCount = requirementSet.size;

  const covered = new Set<string>();
  let highlightsWithEvidence = 0;
  for (const highlight of input.highlights) {
    const reqId = highlight.requirementId.trim();
    if (requirementSet.has(reqId)) covered.add(reqId);
    const hasQuote = highlight.evidence.some(
      (ev) => typeof ev.sourceQuote === "string" && ev.sourceQuote.trim().length > 0,
    );
    if (hasQuote) highlightsWithEvidence += 1;
  }

  const highlightCount = input.highlights.length;
  const computedCoverage =
    totalRequirementCount === 0 ? 0 : covered.size / totalRequirementCount;
  const computedEvidence =
    highlightCount === 0
      ? (totalRequirementCount === 0 ? 1 : 0)
      : highlightsWithEvidence / highlightCount;

  const coverageRatio = round2(
    Math.min(clamp01(input.claimedCoverageRatio), computedCoverage),
  );
  const evidenceCompleteness = round2(
    Math.min(clamp01(input.claimedEvidenceCompleteness), computedEvidence),
  );

  return {
    coverageRatio,
    evidenceCompleteness,
    coveredRequirementCount: covered.size,
    totalRequirementCount,
    highlightsWithEvidence,
    highlightCount,
  };
}

export function confidenceFromEvidence(
  evidenceCompleteness: number,
): MatchScoreConfidence {
  const value = clamp01(evidenceCompleteness);
  if (value >= 0.75) return "high";
  if (value >= 0.4) return "medium";
  return "low";
}

/**
 * Do not present fake high precision when evidence is incomplete:
 * high → one decimal; medium → integer; low → nearest 5.
 */
export function presentMatchScore(
  finalScore: number,
  evidenceCompleteness: number,
): { displayScore: number; confidence: MatchScoreConfidence } {
  const confidence = confidenceFromEvidence(evidenceCompleteness);
  const raw = Number.isFinite(finalScore) ? finalScore : 0;
  const clamped = Math.max(0, Math.min(100, raw));
  if (confidence === "high") {
    return { displayScore: Math.round(clamped * 10) / 10, confidence };
  }
  if (confidence === "medium") {
    return { displayScore: Math.round(clamped), confidence };
  }
  return { displayScore: Math.round(clamped / 5) * 5, confidence };
}

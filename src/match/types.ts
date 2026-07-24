/**
 * MatchReport contract — local schema for structured JD-to-candidate
 * match analysis.
 *
 * Default lifecycle: local-only temporary artifact. Cloud persistence is
 * deferred to P3 or later; this file defines only the local schema.
 */

// ---------------------------------------------------------------------------
// Fixed scoring dimensions and weights (from P0 UI design standards).
// ---------------------------------------------------------------------------

export const MATCH_DIMENSION_WEIGHTS = {
  skills: 0.4,
  experience: 0.35,
  education: 0.15,
  overallImpression: 0.1,
} as const;

export type MatchDimensionKey = keyof typeof MATCH_DIMENSION_WEIGHTS;

export interface MatchDimensionScore {
  dimension: MatchDimensionKey;
  score: number;
  weight: number;
  rationale: string;
}

// ---------------------------------------------------------------------------
// Highlight — a strong match between JD requirement and candidate evidence.
// ---------------------------------------------------------------------------

export interface MatchHighlightEvidence {
  experienceId: string;
  revisionId: string;
  revisionContentHash: string;
  sourceQuote: string;
}

export interface MatchHighlight {
  requirementId: string;
  requirementText: string;
  summary: string;
  evidence: MatchHighlightEvidence[];
}

// ---------------------------------------------------------------------------
// Gap — a JD requirement the candidate does not adequately cover.
// ---------------------------------------------------------------------------

export type MatchGapSeverity = "must_have" | "preferred" | "optional";

export interface MatchGap {
  requirementId: string;
  requirementText: string;
  severity: MatchGapSeverity;
  explanation: string;
  suggestion: string;
}

// ---------------------------------------------------------------------------
// Source reference — pinned versions used to generate the report.
// ---------------------------------------------------------------------------

export interface MatchReportJdReference {
  jdId: string;
  jdHash: string | null;
  requirementIds: string[];
}

export interface MatchReportExperienceReference {
  experienceId: string;
  revisionId: string;
  contentHash: string;
}

// ---------------------------------------------------------------------------
// MatchReport — the full local report.
// ---------------------------------------------------------------------------

export interface MatchReportMeta {
  modelId: string;
  scorerVersion: string;
  generatedAt: string;
}

export interface MatchReport {
  id: string;
  jd: MatchReportJdReference;
  experiences: MatchReportExperienceReference[];
  dimensions: MatchDimensionScore[];
  finalScore: number;
  highlights: MatchHighlight[];
  gaps: MatchGap[];
  coverageRatio: number;
  evidenceCompleteness: number;
  meta: MatchReportMeta;
  expired: boolean;
}

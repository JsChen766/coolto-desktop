import { randomUUID } from "node:crypto";

import type {
  MatchGap,
  MatchHighlight,
  MatchReport,
  MatchReportExperienceReference,
  MatchReportJdReference,
  MatchReportMeta,
} from "./types.js";
import type { DimensionInput } from "./scorer.js";
import { buildDimensionScores, computeFinalScore } from "./scorer.js";

export interface BuildMatchReportParams {
  dimensions: DimensionInput[];
  highlights: MatchHighlight[];
  gaps: MatchGap[];
  coverageRatio: number;
  evidenceCompleteness: number;
}

export function buildMatchReport(
  params: BuildMatchReportParams,
  jdRef: MatchReportJdReference,
  experienceRefs: MatchReportExperienceReference[],
  meta: MatchReportMeta,
): MatchReport {
  const dimensions = buildDimensionScores(params.dimensions);
  const finalScore = computeFinalScore(dimensions);

  return {
    id: `match-report-${randomUUID()}`,
    jd: { ...jdRef, requirementIds: [...jdRef.requirementIds] },
    experiences: experienceRefs.map((e) => ({ ...e })),
    dimensions,
    finalScore,
    highlights: params.highlights.map((h) => ({
      ...h,
      evidence: h.evidence.map((ev) => ({ ...ev })),
    })),
    gaps: params.gaps.map((g) => ({ ...g })),
    coverageRatio: params.coverageRatio,
    evidenceCompleteness: params.evidenceCompleteness,
    meta: { ...meta },
    expired: false,
  };
}

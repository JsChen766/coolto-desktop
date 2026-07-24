import {
  MATCH_DIMENSION_WEIGHTS,
  type MatchDimensionKey,
  type MatchDimensionScore,
} from "./types.js";

const ALL_DIMENSIONS: MatchDimensionKey[] = [
  "skills",
  "experience",
  "education",
  "overallImpression",
];

export interface DimensionInput {
  dimension: MatchDimensionKey;
  score: number;
  rationale: string;
}

export class MatchScorerError extends Error {}

export function buildDimensionScores(inputs: DimensionInput[]): MatchDimensionScore[] {
  const byKey = new Map(inputs.map((d) => [d.dimension, d]));

  for (const key of ALL_DIMENSIONS) {
    if (!byKey.has(key)) {
      throw new MatchScorerError(`缺少维度: ${key}`);
    }
  }

  return ALL_DIMENSIONS.map((key) => {
    const input = byKey.get(key)!;
    if (input.score < 0 || input.score > 100) {
      throw new MatchScorerError(`维度 ${key} 分数超出范围 [0, 100]: ${input.score}`);
    }
    return {
      dimension: key,
      score: input.score,
      weight: MATCH_DIMENSION_WEIGHTS[key],
      rationale: input.rationale,
    };
  });
}

export function computeFinalScore(dimensions: MatchDimensionScore[]): number {
  const weighted = dimensions.reduce(
    (sum, d) => sum + d.score * d.weight,
    0,
  );
  return Math.round(weighted * 10) / 10;
}

export function scoreToTier(
  score: number,
): "excellent" | "good" | "moderate" | "weak" {
  if (score >= 90) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "moderate";
  return "weak";
}

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDimensionScores,
  computeFinalScore,
  scoreToTier,
  MatchScorerError,
} from "../src/match/scorer.js";
import type { DimensionInput } from "../src/match/scorer.js";

function allDimensions(overrides: Partial<Record<string, number>> = {}): DimensionInput[] {
  return [
    { dimension: "skills", score: overrides["skills"] ?? 80, rationale: "ok" },
    { dimension: "experience", score: overrides["experience"] ?? 70, rationale: "ok" },
    { dimension: "education", score: overrides["education"] ?? 75, rationale: "ok" },
    { dimension: "overallImpression", score: overrides["overallImpression"] ?? 65, rationale: "ok" },
  ];
}

test("buildDimensionScores attaches correct weights", () => {
  const dims = buildDimensionScores(allDimensions());
  const skills = dims.find((d) => d.dimension === "skills");
  const experience = dims.find((d) => d.dimension === "experience");
  assert.equal(skills?.weight, 0.4);
  assert.equal(experience?.weight, 0.35);
});

test("computeFinalScore calculates weighted sum correctly", () => {
  const dims = buildDimensionScores(allDimensions({
    skills: 100,
    experience: 0,
    education: 0,
    overallImpression: 0,
  }));
  const score = computeFinalScore(dims);
  assert.equal(score, 40);
});

test("computeFinalScore rounds to one decimal", () => {
  const dims = buildDimensionScores(allDimensions({
    skills: 80,
    experience: 70,
    education: 75,
    overallImpression: 65,
  }));
  const score = computeFinalScore(dims);
  const expected = Math.round((80 * 0.4 + 70 * 0.35 + 75 * 0.15 + 65 * 0.1) * 10) / 10;
  assert.equal(score, expected);
});

test("buildDimensionScores throws when a dimension is missing", () => {
  const inputs = allDimensions().filter((d) => d.dimension !== "education");
  assert.throws(() => buildDimensionScores(inputs), MatchScorerError);
});

test("buildDimensionScores throws on score > 100", () => {
  const inputs = allDimensions({ skills: 101 });
  assert.throws(() => buildDimensionScores(inputs), MatchScorerError);
});

test("buildDimensionScores throws on score < 0", () => {
  const inputs = allDimensions({ skills: -1 });
  assert.throws(() => buildDimensionScores(inputs), MatchScorerError);
});

test("scoreToTier returns excellent for >= 90", () => {
  assert.equal(scoreToTier(90), "excellent");
  assert.equal(scoreToTier(100), "excellent");
});

test("scoreToTier returns correct tiers for boundaries", () => {
  assert.equal(scoreToTier(89.9), "good");
  assert.equal(scoreToTier(70), "good");
  assert.equal(scoreToTier(69.9), "moderate");
  assert.equal(scoreToTier(50), "moderate");
  assert.equal(scoreToTier(49.9), "weak");
  assert.equal(scoreToTier(0), "weak");
});

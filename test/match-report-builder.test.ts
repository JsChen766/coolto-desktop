import assert from "node:assert/strict";
import test from "node:test";

import { buildMatchReport } from "../src/match/report-builder.js";
import type { BuildMatchReportParams } from "../src/match/report-builder.js";
import type { MatchReportJdReference, MatchReportExperienceReference, MatchReportMeta } from "../src/match/types.js";

function makeParams(overrides: Partial<BuildMatchReportParams> = {}): BuildMatchReportParams {
  return {
    dimensions: [
      { dimension: "skills", score: 80, rationale: "good" },
      { dimension: "experience", score: 70, rationale: "ok" },
      { dimension: "education", score: 75, rationale: "ok" },
      { dimension: "overallImpression", score: 65, rationale: "ok" },
    ],
    highlights: [],
    gaps: [],
    coverageRatio: 0.6,
    evidenceCompleteness: 0.8,
    ...overrides,
  };
}

const jdRef: MatchReportJdReference = {
  jdId: "jd-1",
  jdHash: "hash-abc",
  requirementIds: ["req-1", "req-2"],
};

const expRefs: MatchReportExperienceReference[] = [
  { experienceId: "exp-1", revisionId: "rev-1", contentHash: "ch-1" },
];

const meta: MatchReportMeta = {
  modelId: "test-model",
  scorerVersion: "1.0",
  generatedAt: "2026-07-24T00:00:00Z",
};

test("buildMatchReport generates a unique ID with correct prefix", () => {
  const report = buildMatchReport(makeParams(), jdRef, expRefs, meta);
  assert.ok(report.id.startsWith("match-report-"), `id: ${report.id}`);
});

test("buildMatchReport computes finalScore from dimensions", () => {
  const report = buildMatchReport(makeParams(), jdRef, expRefs, meta);
  const expected = Math.round((80 * 0.4 + 70 * 0.35 + 75 * 0.15 + 65 * 0.1) * 10) / 10;
  assert.equal(report.finalScore, expected);
});

test("buildMatchReport copies jdRef fields correctly", () => {
  const report = buildMatchReport(makeParams(), jdRef, expRefs, meta);
  assert.equal(report.jd.jdId, "jd-1");
  assert.equal(report.jd.jdHash, "hash-abc");
  assert.deepEqual(report.jd.requirementIds, ["req-1", "req-2"]);
});

test("buildMatchReport copies meta fields", () => {
  const report = buildMatchReport(makeParams(), jdRef, expRefs, meta);
  assert.equal(report.meta.modelId, "test-model");
  assert.equal(report.meta.scorerVersion, "1.0");
  assert.equal(report.meta.generatedAt, "2026-07-24T00:00:00Z");
});

test("buildMatchReport deep-clones requirementIds so mutation does not affect report", () => {
  const localJdRef = { ...jdRef, requirementIds: ["req-1"] };
  const report = buildMatchReport(makeParams(), localJdRef, expRefs, meta);
  localJdRef.requirementIds.push("req-mutated");
  assert.deepEqual(report.jd.requirementIds, ["req-1"]);
});

test("buildMatchReport sets expired to false", () => {
  const report = buildMatchReport(makeParams(), jdRef, expRefs, meta);
  assert.equal(report.expired, false);
});

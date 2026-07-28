import assert from "node:assert/strict";
import test from "node:test";

import { normalizeResumeFull } from "../src/api/resume-normalizers.js";

test("historical empty Resume score normalizes to zeroes", () => {
  const resume = normalizeResumeFull(fullResume({}));
  assert.deepEqual(resume.score, {
    overall: 0,
    relevance: 0,
    clarity: 0,
    evidenceStrength: 0,
    quantifiedImpact: 0,
  });
});

test("Resume score still rejects malformed populated values", () => {
  assert.throws(
    () => normalizeResumeFull(fullResume({ overall: "high" })),
    /Malformed score\.overall/,
  );
});

function fullResume(score: Record<string, unknown>): Record<string, unknown> {
  const now = "2026-07-28T00:00:00.000Z";
  return {
    id: "resume-1",
    title: "Historical Resume",
    targetRole: null,
    targetCompany: null,
    jdId: null,
    structured: {},
    content: "",
    contentHash: "hash",
    schemaVersion: "resume-document-v1",
    qualityStatus: "unverified",
    status: "active",
    score,
    evidenceSummary: [],
    riskSummary: [],
    missingInfo: [],
    qualityIssues: [],
    qualityGateVersion: null,
    entityVersion: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

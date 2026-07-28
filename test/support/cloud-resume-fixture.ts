import type { ResumeFull, ResumeStructure } from "../../src/resume/types.js";

export function cloudResumeFixture(
  structure: ResumeStructure = { language: "zh-CN", contact: null, sections: [] },
): ResumeFull {
  return {
    id: "resume-1",
    title: "产品经理简历",
    targetRole: "产品经理",
    targetCompany: null,
    jdId: "jd-1",
    contentHash: "content-hash-1",
    schemaVersion: "resume-structure.v1",
    qualityStatus: "passed",
    status: "published",
    entityVersion: 1,
    deletedAt: null,
    createdAt: "2026-07-24T00:00:00Z",
    updatedAt: "2026-07-24T00:00:00Z",
    structured: structure,
    content: "private structured content",
    score: {
      overall: 1,
      relevance: 1,
      clarity: 1,
      evidenceStrength: 1,
      quantifiedImpact: 1,
    },
    evidenceSummary: [],
    riskSummary: [],
    missingInfo: [],
    qualityIssues: [],
    qualityGateVersion: "app-resume-publication-browser-gate-v2",
  };
}

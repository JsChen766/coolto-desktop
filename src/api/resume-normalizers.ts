import type {
  Resume,
  ResumeFull,
  ResumeScore,
} from "../resume/types.js";

export function normalizeResumeFull(value: unknown): ResumeFull {
  const source = record(value, "resume");
  return {
    ...normalizeResume(source),
    structured: record(source.structured, "resume.structured") as unknown as ResumeFull["structured"],
    content: text(source.content, "resume.content"),
    score: normalizeScore(source.score),
    evidenceSummary: array(source.evidenceSummary).map((item) => {
      const value = record(item, "resume.evidenceSummary item");
      return {
        requirementId: text(value.requirement_id, "evidence.requirement_id"),
        requirementText: text(value.requirement_text, "evidence.requirement_text"),
        supportingClaims: array(value.supporting_claims).filter(
          (claim): claim is string => typeof claim === "string",
        ),
        matchScore: number(value.match_score, "evidence.match_score"),
      };
    }),
    riskSummary: array(source.riskSummary).map((item) => {
      const value = record(item, "resume.riskSummary item");
      return {
        type: text(value.type, "risk.type"),
        text: text(value.text, "risk.text"),
        severity: text(value.severity, "risk.severity"),
      };
    }),
    missingInfo: array(source.missingInfo).filter((item): item is string => typeof item === "string"),
    qualityIssues: array(source.qualityIssues).filter(
      (item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item),
    ),
    qualityGateVersion: nullableText(source.qualityGateVersion),
  };
}

export function normalizeResumeList(value: unknown): ResumeFull[] {
  const source = record(value, "resume list");
  return array(source.items).map((item) => {
    const summary = normalizeResume(record(item, "resume"));
    return {
      ...summary,
      structured: { language: "zh-CN", contact: null, sections: [] },
      content: "",
      score: emptyScore(),
      evidenceSummary: [],
      riskSummary: [],
      missingInfo: [],
      qualityIssues: [],
      qualityGateVersion: null,
    };
  });
}

function normalizeResume(source: Record<string, unknown>): Resume {
  return {
    id: text(source.id, "resume.id"),
    title: text(source.title, "resume.title"),
    targetRole: nullableText(source.targetRole),
    targetCompany: nullableText(source.targetCompany),
    jdId: nullableText(source.jdId),
    contentHash: text(source.contentHash, "resume.contentHash"),
    schemaVersion: text(source.schemaVersion, "resume.schemaVersion"),
    qualityStatus: text(source.qualityStatus, "resume.qualityStatus") as Resume["qualityStatus"],
    status: text(source.status, "resume.status") as Resume["status"],
    entityVersion: positiveInteger(source.entityVersion, "resume.entityVersion"),
    deletedAt: nullableText(source.deletedAt),
    createdAt: text(source.createdAt, "resume.createdAt"),
    updatedAt: text(source.updatedAt, "resume.updatedAt"),
  };
}

function normalizeScore(value: unknown): ResumeScore {
  const source = record(value, "resume.score");
  return {
    overall: number(source.overall, "score.overall"),
    relevance: number(source.relevance, "score.relevance"),
    clarity: number(source.clarity, "score.clarity"),
    evidenceStrength: number(source.evidence_strength, "score.evidence_strength"),
    quantifiedImpact: number(source.quantified_impact, "score.quantified_impact"),
  };
}

function emptyScore(): ResumeScore {
  return { overall: 0, relevance: 0, clarity: 0, evidenceStrength: 0, quantifiedImpact: 0 };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Malformed ${label}`);
  }
  return value as Record<string, unknown>;
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Malformed ${label}`);
  return value;
}
function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function number(value: unknown, label: string): number {
  if (typeof value !== "number") throw new Error(`Malformed ${label}`);
  return value;
}
function positiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`Malformed ${label}`);
  }
  return value;
}

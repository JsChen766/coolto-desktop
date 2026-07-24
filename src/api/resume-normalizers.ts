import type {
  Resume,
  ResumeFull,
  ResumeItem,
  ResumeVariant,
} from "../resume/types.js";

export function normalizeResumeFull(value: unknown): ResumeFull {
  const source = record(value, "resume");
  return {
    ...normalizeResume(source),
    items: array(source.items).map(normalizeItem),
    variants: array(source.variants).map(normalizeVariant),
  };
}

export function normalizeResumeList(value: unknown): ResumeFull[] {
  const source = record(value, "resume list");
  return array(source.items).map((item) => ({
    ...normalizeResume(record(item, "resume")),
    items: [],
    variants: [],
  }));
}

function normalizeResume(source: Record<string, unknown>): Resume {
  return {
    id: text(source.id, "resume.id"),
    title: text(source.title, "resume.title"),
    targetRole: nullableText(source.targetRole),
    jdId: nullableText(source.jdId),
    activeVariantId: nullableText(source.activeVariantId),
    status: text(source.status, "resume.status") as Resume["status"],
    createdAt: text(source.createdAt, "resume.createdAt"),
    updatedAt: text(source.updatedAt, "resume.updatedAt"),
  };
}

function normalizeItem(value: unknown): ResumeItem {
  const source = record(value, "resume item");
  return {
    id: text(source.id, "item.id"),
    resumeId: text(source.resumeId, "item.resumeId"),
    sectionType: text(source.sectionType, "item.sectionType") as ResumeItem["sectionType"],
    title: nullableText(source.title),
    contentSnapshot: text(source.contentSnapshot, "item.contentSnapshot"),
    orderIndex: number(source.orderIndex, "item.orderIndex"),
    hidden: boolean(source.hidden, "item.hidden"),
    pinned: boolean(source.pinned, "item.pinned"),
    sourceExperienceId: nullableText(source.sourceExperienceId),
    sourceVariantId: nullableText(source.sourceVariantId),
    updatedAt: text(source.updatedAt, "item.updatedAt"),
  };
}

function normalizeVariant(value: unknown): ResumeVariant {
  const source = record(value, "resume variant");
  const version = typeof source.version === "number" ? source.version : undefined;
  const gateStatus = typeof source.gateStatus === "string"
    ? source.gateStatus as NonNullable<ResumeVariant["gateStatus"]>
    : undefined;
  const publicationStatus = typeof source.publicationStatus === "string"
    ? source.publicationStatus as NonNullable<ResumeVariant["publicationStatus"]>
    : undefined;
  return {
    id: text(source.id, "variant.id"),
    title: text(source.title, "variant.title"),
    content: text(source.content, "variant.content"),
    structured:
      source.structured && typeof source.structured === "object"
        ? source.structured as NonNullable<ResumeVariant["structured"]>
        : null,
    parentVariantId: nullableText(source.parentVariantId),
    ...(version === undefined ? {} : { version }),
    score: normalizeScore(source.score),
    evidenceSummary: Array.isArray(source.evidenceSummary)
      ? source.evidenceSummary as ResumeVariant["evidenceSummary"]
      : [],
    riskSummary: Array.isArray(source.riskSummary)
      ? source.riskSummary as ResumeVariant["riskSummary"]
      : [],
    missingInfo: array(source.missingInfo).filter((item): item is string => typeof item === "string"),
    ...(gateStatus ? { gateStatus } : {}),
    ...(publicationStatus ? { publicationStatus } : {}),
    createdAt: text(source.createdAt, "variant.createdAt"),
  };
}

function normalizeScore(value: unknown): ResumeVariant["score"] {
  const source = record(value, "variant.score");
  return {
    overall: number(source.overall, "score.overall"),
    relevance: number(source.relevance, "score.relevance"),
    clarity: number(source.clarity, "score.clarity"),
    evidenceStrength: number(source.evidenceStrength, "score.evidenceStrength"),
    quantifiedImpact: number(source.quantifiedImpact, "score.quantifiedImpact"),
  };
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
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Malformed ${label}`);
  return value;
}

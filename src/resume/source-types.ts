import type {
  ExperienceCategory,
  JdRequirementImportance,
  JdRequirementV2Importance,
} from "../api/types.js";
import type { ResumeTemplateSnapshot } from "./template-contract.js";

export const RESUME_SOURCE_SNAPSHOT_SCHEMA_VERSION =
  "resume-source-snapshot-v1" as const;

export interface ResumeSourceProfileSnapshot {
  userId: string;
  fullName: string | null;
  contactEmail: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  personalWebsite: string | null;
  preferredLanguage: string | null;
  resumeStyle: string | null;
}

export interface ResumeSourceRequirementSnapshot {
  id: string;
  text: string;
  category: string;
  importance: JdRequirementImportance;
  keywords: readonly string[];
  weight: number | null;
  v2Importance: JdRequirementV2Importance | null;
  v2Category: string | null;
}

export interface ResumeSourceJdSnapshot {
  id: string;
  title: string;
  company: string | null;
  targetRole: string | null;
  rawText: string;
  requirements: readonly ResumeSourceRequirementSnapshot[];
  serverHash: string | null;
  contentHash: string;
  requirementsOrigin: string;
  updatedAt: string;
}

export interface ResumeSourceExperienceSnapshot {
  id: string;
  category: ExperienceCategory;
  title: string;
  organization: string | null;
  role: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  tags: readonly string[];
  resumeSectionKey: string | null;
  resumeSectionLabel: string | null;
  revisionId: string;
  serverRevisionHash: string | null;
  contentHash: string;
  content: string;
  createdAt?: string;
  updatedAt: string;
}

export interface ResumeSourceSnapshot {
  schemaVersion: typeof RESUME_SOURCE_SNAPSHOT_SCHEMA_VERSION;
  generationStrategy?: "tailored" | "general";
  capturedAt: string;
  sourceFingerprint: string;
  profile: Readonly<ResumeSourceProfileSnapshot>;
  jd: Readonly<ResumeSourceJdSnapshot> | null;
  experiences: readonly Readonly<ResumeSourceExperienceSnapshot>[];
  template: Readonly<ResumeTemplateSnapshot>;
}

export interface TailoredResumeSourceSnapshot extends ResumeSourceSnapshot {
  generationStrategy?: "tailored";
  jd: Readonly<ResumeSourceJdSnapshot>;
}

export interface GeneralResumeSourceSnapshot extends ResumeSourceSnapshot {
  generationStrategy: "general";
  jd: null;
}

export type ResumeGenerationSourceSnapshot =
  | TailoredResumeSourceSnapshot
  | GeneralResumeSourceSnapshot;

export interface ResumeSourceSnapshotInput {
  jdId: string;
  experienceIds: readonly string[];
  template: ResumeTemplateSnapshot;
}

export interface GeneralResumeSourceSnapshotInput {
  experienceIds: readonly string[];
  template: ResumeTemplateSnapshot;
}

export interface SourceEvidenceExcerpt {
  experienceId: string;
  revisionId: string;
  revisionContentHash: string;
  sourceStart: number;
  sourceEnd: number;
  sourceQuote: string;
}

export interface BulletEvidenceBinding {
  bulletId: string;
  sourceExperienceId: string;
  bulletText: string;
  excerpts: readonly SourceEvidenceExcerpt[];
  matchedRequirementIds: readonly string[];
  /**
   * Soft-evidence bullets (e.g. skill lines) may share source ranges with
   * other bullets; their ranges are not exclusive. Numbers and verbatim
   * quote checks still apply.
   */
  sharedEvidence?: boolean;
}

export interface EvidenceCandidate {
  sourceFingerprint: string;
  bullets: readonly BulletEvidenceBinding[];
}

export interface EvidenceValidationIssue {
  code: string;
  message: string;
  bulletId?: string;
}

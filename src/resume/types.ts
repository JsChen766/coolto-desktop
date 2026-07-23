/**
 * Shared resume storage/API contract.
 *
 * The snake_case fields inside `ResumeStructure` are persisted in the backend
 * `ResumeVariant.structured` JSON. The camelCase fields on Resume/ResumeVariant
 * mirror the existing product API response. Do not translate the structured
 * payload into a second App-only format.
 */

export type ResumeTemplateId = "resume-standard" | "resume-sparse";

export type ResumeSectionType =
  | "summary"
  | "education"
  | "experience"
  | "project"
  | "skills"
  | "other";

/** The legacy ResumeItem table uses the backend's plural `projects` value. */
export type ResumeItemSectionType =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "other";

export interface ResumeBullet {
  id: string;
  text: string;
  matched_jd_requirement_ids: string[];
  source_fact_ids?: string[];
  layout_exception?: "unfixable_grounded_short" | null;
}

export interface ResumeSectionItem {
  id: string;
  title: string | null;
  organization: string | null;
  role: string | null;
  location?: string | null;
  start_date: string | null;
  end_date: string | null;
  source_experience_id: string | null;
  bullets: ResumeBullet[];
  raw_text: string | null;
}

export interface ResumeSection {
  id: string;
  type: ResumeSectionType;
  heading: string | null;
  items: ResumeSectionItem[];
}

export interface ResumeContact {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin?: string | null;
}

export interface ResumeLayoutTuning {
  body_font_scale: number;
  body_line_height: number;
  section_gap_scale: number;
  item_gap_scale: number;
  bullet_gap_scale: number;
}

export interface ResumeLayoutTargetBand {
  minimum: number;
  target: number;
  maximum: number;
}

export interface ResumeQualityIssue {
  code: string;
  message: string;
}

/** Reads both current and legacy persisted variants. */
export interface ResumeStructure {
  language: string;
  contact: ResumeContact | null;
  sections: ResumeSection[];
  layout_template_id?: ResumeTemplateId;
  layout_profile_version?: string;
  layout_profile_hash?: string;
  layout_tuning?: ResumeLayoutTuning;
  layout_usage_ratio?: number;
  layout_target_band?: ResumeLayoutTargetBand;
  quality_status?: "passed" | "needs_user_decision" | "failed";
  quality_issues?: ResumeQualityIssue[];
}

/** New App-generated variants must always pin the complete layout contract. */
export interface CurrentResumeStructure extends ResumeStructure {
  layout_template_id: ResumeTemplateId;
  layout_profile_version: string;
  layout_profile_hash: string;
  layout_tuning: ResumeLayoutTuning;
  layout_target_band: ResumeLayoutTargetBand;
}

export type ResumeStatus = "draft" | "active" | "published" | "archived";
export type ResumeVariantGateStatus =
  | "unverified"
  | "passed"
  | "needs_revision"
  | "failed";
export type ResumeVariantPublicationStatus =
  | "staged"
  | "published"
  | "discarded";

export interface Resume {
  id: string;
  title: string;
  targetRole: string | null;
  jdId: string | null;
  activeVariantId: string | null;
  status: ResumeStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ResumeScore {
  overall: number;
  relevance: number;
  clarity: number;
  evidenceStrength: number;
  quantifiedImpact: number;
}

export interface ResumeEvidenceSummaryItem {
  requirementId: string;
  requirementText: string;
  supportingClaims: string[];
  matchScore: number;
}

export interface ResumeRiskSummaryItem {
  type: string;
  text: string;
  severity: string;
}

export interface ResumeVariant {
  id: string;
  title: string;
  content: string;
  structured?: ResumeStructure | null;
  parentVariantId?: string | null;
  version?: number;
  score: ResumeScore;
  evidenceSummary: ResumeEvidenceSummaryItem[];
  riskSummary: ResumeRiskSummaryItem[];
  missingInfo: string[];
  gateStatus?: ResumeVariantGateStatus;
  publicationStatus?: ResumeVariantPublicationStatus;
  createdAt: string;
}

export interface ResumeItem {
  id: string;
  resumeId: string;
  sectionType: ResumeItemSectionType;
  title: string | null;
  contentSnapshot: string;
  orderIndex: number;
  hidden: boolean;
  pinned: boolean;
  sourceExperienceId: string | null;
  sourceVariantId: string | null;
  updatedAt: string;
}

export interface ResumeFull extends Resume {
  items: ResumeItem[];
  variants: ResumeVariant[];
}


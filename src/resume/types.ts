/**
 * Shared resume storage/API contract.
 *
 * The snake_case fields inside `ResumeStructure` are persisted directly on the
 * backend Resume document. Do not translate the payload into an App-only format.
 */

export type ResumeTemplateId = "resume-standard" | "resume-sparse";

export type ResumeSectionType =
  | "summary"
  | "education"
  | "experience"
  | "project"
  | "skills"
  | "other";

export interface ResumeBullet {
  id: string;
  text: string;
  matched_jd_requirement_ids: string[];
  source_fact_ids?: string[];
  source_evidence?: Array<{
    experience_id: string;
    revision_id: string;
    revision_content_hash: string;
    source_start: number;
    source_end: number;
    source_quote: string;
  }>;
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
  section_key?: string;
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

/** New App-generated documents must always pin the complete layout contract. */
export interface CurrentResumeStructure extends ResumeStructure {
  layout_template_id: ResumeTemplateId;
  layout_profile_version: string;
  layout_profile_hash: string;
  layout_tuning: ResumeLayoutTuning;
  layout_target_band: ResumeLayoutTargetBand;
}

export type ResumeStatus = "draft" | "active" | "published" | "archived";
export type ResumeQualityStatus =
  | "unverified"
  | "passed"
  | "needs_revision"
  | "failed";

export interface Resume {
  id: string;
  title: string;
  targetRole: string | null;
  targetCompany: string | null;
  jdId: string | null;
  contentHash: string;
  schemaVersion: string;
  qualityStatus: ResumeQualityStatus;
  status: ResumeStatus;
  entityVersion: number;
  deletedAt: string | null;
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

export interface ResumeFull extends Resume {
  structured: ResumeStructure;
  content: string;
  score: ResumeScore;
  evidenceSummary: ResumeEvidenceSummaryItem[];
  riskSummary: ResumeRiskSummaryItem[];
  missingInfo: string[];
  qualityIssues: Array<Record<string, unknown>>;
  qualityGateVersion: string | null;
}

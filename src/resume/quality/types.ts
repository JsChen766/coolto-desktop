import type { ResumePatchOperationInput } from "../workspace/types.js";

export type ResumeQualityIssueCode =
  | "near_duplicate_bullet"
  | "uncovered_must_have_requirement"
  | "missing_source_for_must_have_requirement"
  | "unsupported_responsibility_claim"
  | "unsupported_technology_claim"
  | "layout_violation"
  | "missing_experience_content"
  | "unbound_additional_content";

export interface ResumeQualityIssue {
  code: ResumeQualityIssueCode;
  message: string;
  repairable: boolean;
  priority: number;
  bulletIds?: string[];
  itemId?: string;
  requirementId?: string;
  violationCode?: string;
}

export interface ResumeQualityScore {
  overall: number;
  weightedJdCoverage: number;
  mustHaveCoverage: number;
  evidenceSpecificity: number;
  informationDiversity: number;
}

export interface ResumeRepairTarget {
  targetId: string;
  type: ResumeQualityIssueCode;
  priority: number;
  bulletIds: string[];
  itemId?: string;
  requirementId?: string;
  instruction: string;
}

export interface ResumeQualityReport {
  passed: boolean;
  blocking: boolean;
  issues: ResumeQualityIssue[];
  score: ResumeQualityScore;
  repairTargets: ResumeRepairTarget[];
  frozenBulletIds: string[];
}

export interface ResumePatchAlternative {
  label?: string;
  operations: ResumePatchOperationInput[];
}

export interface ResumeAlternativeTargetInput {
  targetId: string;
  alternatives: ResumePatchAlternative[];
}

export interface RepairRoundDiagnostic {
  round: number;
  targetIds: string[];
  alternativesEvaluated: number;
  candidatesCompiled: number;
  selectedRevision: number;
  selectedReason: string;
  changedBulletIds: string[];
  elapsedMs: number;
}

export interface AvailableEvidenceCandidate {
  evidenceId: string;
  experienceId: string;
  revisionId: string;
  revisionContentHash: string;
  sourceStart: number;
  sourceEnd: number;
  sourceQuote: string;
  matchedRequirementIds: string[];
  valueScore: number;
  valueReasons: string[];
}

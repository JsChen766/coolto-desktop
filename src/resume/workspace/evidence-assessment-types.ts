export type ResumeEvidenceAssessmentRound = 1 | 2;
export type ResumeEvidenceAssessmentPhase =
  | "reassessment_1"
  | "grounded_fill_1"
  | "reassessment_2"
  | "grounded_fill_2"
  | "neutral_closure";

export type ResumeEvidenceDecisionStatus =
  | "pending"
  | "selected"
  | "used"
  | "deferred"
  | "excluded_duplicate"
  | "excluded_invalid"
  | "rejected_write"
  | "deferred_space";

export interface ResumeEvidenceDecision {
  evidenceId: string;
  experienceId: string;
  status: ResumeEvidenceDecisionStatus;
  assessmentRound: 0 | ResumeEvidenceAssessmentRound;
  reasonCode: string;
  assessedAtRevision: number;
}

export interface ResumeEvidenceAssessmentState {
  phase: ResumeEvidenceAssessmentPhase;
  round: ResumeEvidenceAssessmentRound;
  noMoreMaterialConfirmedAt: string;
  targetingQuality: "standard" | "limited";
  decisions: Record<string, ResumeEvidenceDecision>;
}

export interface ResumeEvidenceAssessmentInput {
  evidenceId: string;
  status: "selected" | "deferred" | "excluded_duplicate" | "excluded_invalid";
  reasonCode: string;
}

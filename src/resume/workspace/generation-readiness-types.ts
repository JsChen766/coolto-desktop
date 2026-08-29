export type ResumeGenerationBlockerCode =
  | "layout_not_current"
  | "layout_not_qualified"
  | "item_tier_missing"
  | "bullet_count_too_low"
  | "item_empty"
  | "item_line_budget_shortfall"
  | "item_line_allocation_stale"
  | "bullet_provenance_missing"
  | "grounded_evidence_missing"
  | "augmented_confirmation_pending"
  | "sentence_punctuation"
  | "bullet_content_padding"
  | "critical_skill_evidence_missing"
  | "reuse_adaptation_pending"
  | "supplemental_evidence_not_integrated";

export interface ResumeGenerationBlocker {
  code: ResumeGenerationBlockerCode;
  message: string;
  itemId?: string;
  bulletId?: string;
}

export interface ResumeGenerationReadiness {
  ready: boolean;
  blockers: ResumeGenerationBlocker[];
  warnings: ResumeGenerationBlocker[];
}

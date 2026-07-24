export type ResumeWorkspaceErrorCode =
  | "candidate_not_found"
  | "candidate_not_ready_for_save"
  | "candidate_evidence_incomplete"
  | "stale_candidate_revision"
  | "workspace_revision_limit"
  | "missing_education_source"
  | "unsupported_experience_category"
  | "invalid_experience_order"
  | "item_not_found"
  | "bullet_not_found"
  | "duplicate_bullet_id"
  | "bullet_source_mismatch"
  | "invalid_patch_operation"
  | "quality_review_requires_layout"
  | "quality_review_already_started"
  | "quality_repair_requires_alternatives"
  | "invalid_repair_target"
  | "repair_round_limit";

export class ResumeWorkspaceError extends Error {
  public constructor(
    public readonly code: ResumeWorkspaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResumeWorkspaceError";
  }
}

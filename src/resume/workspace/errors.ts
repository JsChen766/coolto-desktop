export type ResumeWorkspaceErrorCode =
  | "candidate_not_found"
  | "stale_candidate_revision"
  | "workspace_revision_limit"
  | "missing_education_source"
  | "unsupported_experience_category"
  | "invalid_experience_order"
  | "item_not_found"
  | "bullet_not_found"
  | "duplicate_bullet_id"
  | "bullet_source_mismatch"
  | "invalid_patch_operation";

export class ResumeWorkspaceError extends Error {
  public constructor(
    public readonly code: ResumeWorkspaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResumeWorkspaceError";
  }
}

export type ResumeSourceSnapshotErrorCode =
  | "invalid_snapshot_request"
  | "duplicate_experience_id"
  | "profile_identity_mismatch"
  | "invalid_jd"
  | "duplicate_requirement_id"
  | "inactive_experience"
  | "missing_current_revision"
  | "current_revision_mismatch"
  | "empty_revision_content";

export class ResumeSourceSnapshotError extends Error {
  public constructor(
    public readonly code: ResumeSourceSnapshotErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResumeSourceSnapshotError";
  }
}

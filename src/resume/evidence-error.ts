export type EvidenceValidationErrorCode =
  | "source_snapshot_mismatch"
  | "invalid_bullet_id"
  | "duplicate_bullet_id"
  | "empty_bullet_text"
  | "unknown_source_experience"
  | "missing_source_excerpt"
  | "excerpt_experience_mismatch"
  | "excerpt_revision_mismatch"
  | "invalid_source_range"
  | "source_quote_mismatch"
  | "duplicate_source_range"
  | "duplicate_requirement_id"
  | "unknown_requirement_id"
  | "unknown_evidence_id"
  | "invalid_evidence_id"
  | "unsupported_numeric_claim";

export class EvidenceValidationError extends Error {
  public constructor(
    public readonly code: EvidenceValidationErrorCode,
    message: string,
    public readonly bulletId?: string,
  ) {
    super(message);
    this.name = "EvidenceValidationError";
  }
}

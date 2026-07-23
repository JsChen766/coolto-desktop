import type {
  BulletEvidenceBinding,
  ResumeSourceExperienceSnapshot,
  SourceEvidenceExcerpt,
} from "./source-types.js";

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

export interface ReservedEvidenceRange {
  bulletId: string;
  experienceId: string;
  revisionId: string;
  start: number;
  end: number;
}

export interface EvidenceValidationContext {
  experiences: ReadonlyMap<string, ResumeSourceExperienceSnapshot>;
  requirementIds: ReadonlySet<string>;
  reservedRanges: readonly ReservedEvidenceRange[];
}

export function normalizeEvidenceBinding(
  binding: BulletEvidenceBinding,
): BulletEvidenceBinding {
  const bulletId = binding.bulletId.trim();
  if (!bulletId) {
    throw new EvidenceValidationError(
      "invalid_bullet_id",
      "Evidence bindings require a non-empty stable bullet ID.",
    );
  }
  return {
    bulletId,
    sourceExperienceId: binding.sourceExperienceId.trim(),
    bulletText: binding.bulletText,
    excerpts: binding.excerpts.map((excerpt) => ({
      ...excerpt,
      experienceId: excerpt.experienceId.trim(),
      revisionId: excerpt.revisionId.trim(),
      revisionContentHash: excerpt.revisionContentHash.trim(),
    })),
    matchedRequirementIds: binding.matchedRequirementIds.map((value) =>
      value.trim(),
    ),
  };
}

export function validateEvidenceBinding(
  binding: BulletEvidenceBinding,
  context: EvidenceValidationContext,
): void {
  const bulletId = binding.bulletId;
  if (!binding.bulletText.trim()) {
    throw new EvidenceValidationError(
      "empty_bullet_text",
      `Bullet ${bulletId} has no text.`,
      bulletId,
    );
  }
  const experience = context.experiences.get(binding.sourceExperienceId);
  if (!experience) {
    throw new EvidenceValidationError(
      "unknown_source_experience",
      `Bullet ${bulletId} references an experience outside the snapshot.`,
      bulletId,
    );
  }
  if (!binding.excerpts.length) {
    throw new EvidenceValidationError(
      "missing_source_excerpt",
      `Bullet ${bulletId} must cite at least one source excerpt.`,
      bulletId,
    );
  }
  validateRequirements(binding, context.requirementIds);
  const currentRanges = [...context.reservedRanges];
  for (const excerpt of binding.excerpts) {
    validateExcerpt(binding, experience, excerpt, currentRanges);
    currentRanges.push({
      bulletId,
      experienceId: excerpt.experienceId,
      revisionId: excerpt.revisionId,
      start: excerpt.sourceStart,
      end: excerpt.sourceEnd,
    });
  }
  validateNumbers(binding);
}

export function reservedRangesFromBindings(
  bindings: Iterable<BulletEvidenceBinding>,
): ReservedEvidenceRange[] {
  return Array.from(bindings).flatMap((binding) =>
    binding.excerpts.map((excerpt) => ({
      bulletId: binding.bulletId,
      experienceId: excerpt.experienceId,
      revisionId: excerpt.revisionId,
      start: excerpt.sourceStart,
      end: excerpt.sourceEnd,
    })),
  );
}

function validateRequirements(
  binding: BulletEvidenceBinding,
  knownIds: ReadonlySet<string>,
): void {
  const ids = binding.matchedRequirementIds;
  if (new Set(ids).size !== ids.length) {
    throw new EvidenceValidationError(
      "duplicate_requirement_id",
      `Bullet ${binding.bulletId} contains duplicate JD requirement IDs.`,
      binding.bulletId,
    );
  }
  if (ids.some((value) => !knownIds.has(value))) {
    throw new EvidenceValidationError(
      "unknown_requirement_id",
      `Bullet ${binding.bulletId} references a requirement outside the selected JD.`,
      binding.bulletId,
    );
  }
}

function validateExcerpt(
  binding: BulletEvidenceBinding,
  experience: ResumeSourceExperienceSnapshot,
  excerpt: SourceEvidenceExcerpt,
  reservedRanges: readonly ReservedEvidenceRange[],
): void {
  const bulletId = binding.bulletId;
  if (
    excerpt.experienceId !== binding.sourceExperienceId ||
    excerpt.experienceId !== experience.id
  ) {
    throw new EvidenceValidationError(
      "excerpt_experience_mismatch",
      `Bullet ${bulletId} cites an excerpt from another experience.`,
      bulletId,
    );
  }
  if (
    excerpt.revisionId !== experience.revisionId ||
    excerpt.revisionContentHash !== experience.contentHash
  ) {
    throw new EvidenceValidationError(
      "excerpt_revision_mismatch",
      `Bullet ${bulletId} cites a stale or mismatched revision.`,
      bulletId,
    );
  }
  if (
    !Number.isInteger(excerpt.sourceStart) ||
    !Number.isInteger(excerpt.sourceEnd) ||
    excerpt.sourceStart < 0 ||
    excerpt.sourceEnd <= excerpt.sourceStart ||
    excerpt.sourceEnd > experience.content.length
  ) {
    throw new EvidenceValidationError(
      "invalid_source_range",
      `Bullet ${bulletId} has an invalid source range.`,
      bulletId,
    );
  }
  if (
    !excerpt.sourceQuote ||
    experience.content.slice(excerpt.sourceStart, excerpt.sourceEnd) !==
      excerpt.sourceQuote
  ) {
    throw new EvidenceValidationError(
      "source_quote_mismatch",
      `Bullet ${bulletId} quote does not match its source offsets.`,
      bulletId,
    );
  }
  if (
    reservedRanges.some(
      (range) =>
        range.experienceId === excerpt.experienceId &&
        range.revisionId === excerpt.revisionId &&
        rangesOverlap(
          range.start,
          range.end,
          excerpt.sourceStart,
          excerpt.sourceEnd,
        ),
    )
  ) {
    throw new EvidenceValidationError(
      "duplicate_source_range",
      `Bullet ${bulletId} reuses source text already reserved by another bullet.`,
      bulletId,
    );
  }
}

function validateNumbers(binding: BulletEvidenceBinding): void {
  const citedText = binding.excerpts
    .map((excerpt) => excerpt.sourceQuote)
    .join("\n");
  const sourceNumbers = extractNumbers(citedText);
  const unsupported = extractNumbers(binding.bulletText).filter(
    (value) => !sourceNumbers.includes(value),
  );
  if (unsupported.length) {
    throw new EvidenceValidationError(
      "unsupported_numeric_claim",
      `Bullet ${binding.bulletId} contains numbers absent from its cited source: ${Array.from(new Set(unsupported)).join(", ")}.`,
      binding.bulletId,
    );
  }
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function extractNumbers(value: string): string[] {
  return Array.from(
    value.matchAll(/(?:\p{Sc}\s*)?\d[\d,.]*(?:\s*%)?/gu),
    (match) => match[0].replace(/\s+/g, ""),
  );
}

import type { ResumeSourceExperienceSnapshot } from "./source-types.js";
import type {
  BulletEvidenceBinding,
  SourceEvidenceExcerpt,
} from "./source-types.js";
import { extractEvidenceNumbers } from "./evidence-numbers.js";
import { EvidenceValidationError } from "./evidence-error.js";
import type {
  EvidenceValidationContext,
  ReservedEvidenceRange,
} from "./evidence-validation.js";

export function validateExcerpt(
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
  validateRangeAndQuote(binding, experience, excerpt, bulletId);
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

/**
 * Soft-evidence excerpts (e.g. skill lines) are validated against their own
 * experience: range legality, verbatim quote and revision matching still
 * hold, but ranges are not exclusive and the source experience may differ
 * from the binding's primary experience.
 */
export function validateSoftExcerpt(
  context: EvidenceValidationContext,
  binding: BulletEvidenceBinding,
  excerpt: SourceEvidenceExcerpt,
): void {
  const bulletId = binding.bulletId;
  const ownExperience = context.experiences.get(excerpt.experienceId);
  if (!ownExperience) {
    throw new EvidenceValidationError(
      "unknown_source_experience",
      `Bullet ${bulletId} cites an unknown experience ${excerpt.experienceId}.`,
      bulletId,
    );
  }
  if (
    excerpt.revisionId !== ownExperience.revisionId ||
    excerpt.revisionContentHash !== ownExperience.contentHash
  ) {
    throw new EvidenceValidationError(
      "excerpt_revision_mismatch",
      `Bullet ${bulletId} cites a stale or mismatched revision.`,
      bulletId,
    );
  }
  validateRangeAndQuote(binding, ownExperience, excerpt, bulletId);
}

export function validateNumbers(binding: BulletEvidenceBinding): void {
  const citedText = binding.excerpts.map((excerpt) => excerpt.sourceQuote).join("\n");
  const sourceNumbers = extractEvidenceNumbers(citedText);
  const unsupported = extractEvidenceNumbers(binding.bulletText).filter(
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

function validateRangeAndQuote(
  binding: BulletEvidenceBinding,
  experience: ResumeSourceExperienceSnapshot,
  excerpt: SourceEvidenceExcerpt,
  bulletId: string,
): void {
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
}

export function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

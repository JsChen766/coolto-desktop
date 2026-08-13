import type {
  BulletEvidenceBinding,
  ResumeSourceExperienceSnapshot,
  SourceEvidenceExcerpt,
} from "./source-types.js";
import { EvidenceValidationError } from "./evidence-error.js";
import { validateExcerpt, validateNumbers, validateSoftExcerpt } from "./excerpt-validation.js";

export {
  EvidenceValidationError,
  type EvidenceValidationErrorCode,
} from "./evidence-error.js";

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
  // Bullets must never end with a period (product rule): strip trailing
  // sentence punctuation and whitespace so every path (write, patch, tail
  // fix) produces the same period-free contract.
  const bulletText = stripTrailingPunctuation(binding.bulletText);
  if (!bulletText) {
    throw new EvidenceValidationError(
      "empty_bullet_text",
      "Evidence bindings require a non-empty bullet text.",
      bulletId,
    );
  }
  return {
    bulletId,
    sourceExperienceId: binding.sourceExperienceId.trim(),
    bulletText,
    excerpts: binding.excerpts.map((excerpt) => ({
      ...excerpt,
      experienceId: excerpt.experienceId.trim(),
      revisionId: excerpt.revisionId.trim(),
      revisionContentHash: excerpt.revisionContentHash.trim(),
    })),
    matchedRequirementIds: binding.matchedRequirementIds.map((value) => value.trim()),
    ...(binding.sharedEvidence ? { sharedEvidence: true } : {}),
  };
}

/** Removes trailing sentence punctuation and whitespace from a bullet text. */
function stripTrailingPunctuation(text: string): string {
  return text.replace(/[\s。．.！!？?；;]+$/u, "");
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
  if (binding.sharedEvidence) {
    for (const excerpt of binding.excerpts) {
      validateSoftExcerpt(context, binding, excerpt);
    }
    validateNumbers(binding);
    return;
  }
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
    binding.sharedEvidence
      ? []
      : binding.excerpts.map((excerpt) => ({
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




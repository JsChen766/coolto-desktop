import { EvidenceValidationError } from "../evidence-validation.js";
import type { AvailableEvidenceCandidate } from "../quality/types.js";
import type {
  BulletEvidenceBinding,
  SourceEvidenceExcerpt,
} from "../source-types.js";
import {
  conflictsWithWork,
  excerptFrom,
  firstUnusedCandidate,
} from "./evidence-candidate-selection.js";
import type { EvidenceRepairAction } from "./evidence-auto-repair.js";

/**
 * Replaces cited ranges that are already reserved by another bullet with the
 * highest-value unused candidate of the same experience. Soft-evidence
 * bullets (skill lines, sharedEvidence) skip this entirely: their ranges may
 * be shared, mirroring the write path's exemption.
 *
 * When no unused candidate exists the rejection names the reserving bullets
 * and how much unused evidence remains, so a deadlocked retry can either
 * pick a free range or unblock a conflicting bullet first instead of
 * re-submitting the identical operation forever.
 */
export function repairRangeConflicts(
  excerpts: readonly SourceEvidenceExcerpt[],
  experienceId: string,
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  bulletId: string,
  repairs: EvidenceRepairAction[],
  sharedEvidence = false,
): readonly SourceEvidenceExcerpt[] {
  if (sharedEvidence) return excerpts;
  const replaced: SourceEvidenceExcerpt[] = [];
  return excerpts.map((excerpt) => {
    if (
      !conflictsWithWork(work, experienceId, excerpt.sourceStart, excerpt.sourceEnd)
    ) {
      return excerpt;
    }
    const replacement = firstUnusedCandidate(
      candidates,
      experienceId,
      work,
      excerpt,
      [...replaced, ...excerpts.filter((other) => other !== excerpt)],
    );
    if (!replacement) {
      throw new EvidenceValidationError(
        "duplicate_source_range",
        buildExhaustedMessage(bulletId, work, candidates, experienceId, excerpt, replaced, excerpts),
        bulletId,
      );
    }
    replaced.push(excerptFrom(replacement));
    repairs.push({
      kind: "range_conflict",
      action: "replaced",
      bulletId,
      evidenceIds: [replacement.evidenceId],
    });
    return excerptFrom(replacement);
  });
}

function buildExhaustedMessage(
  bulletId: string,
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  experienceId: string,
  excerpt: SourceEvidenceExcerpt,
  replaced: readonly SourceEvidenceExcerpt[],
  excerpts: readonly SourceEvidenceExcerpt[],
): string {
  const conflictingBullets = [...work.values()]
    .filter((binding) =>
      binding.excerpts.some(
        (other) =>
          other.experienceId === experienceId &&
          other.sourceStart < excerpt.sourceEnd &&
          excerpt.sourceStart < other.sourceEnd,
      ),
    )
    .map((binding) => binding.bulletId);
  const availableCount = [...candidates.values()].filter(
    (candidate) =>
      candidate.experienceId === experienceId &&
      !(candidate.sourceStart === excerpt.sourceStart &&
        candidate.sourceEnd === excerpt.sourceEnd) &&
      !conflictsWithWork(
        work,
        experienceId,
        candidate.sourceStart,
        candidate.sourceEnd,
      ) &&
      ![...replaced, ...excerpts].some(
        (other) =>
          other.experienceId === experienceId &&
          other.sourceStart < candidate.sourceEnd &&
          candidate.sourceStart < other.sourceEnd,
      ),
  ).length;
  const reservedBy = conflictingBullets.length
    ? ` reserved by bullets [${conflictingBullets.join(", ")}]`
    : "";
  const remaining = availableCount
    ? `${availableCount} unused candidates remain`
    : "no unused evidence remains for this experience";
  const exitHint =
    availableCount === 0
      ? " — remove or rewrite the conflicting bullet first, then retry"
      : "";
  return (
    `Bullet ${bulletId} reuses source text${reservedBy} and ${remaining}; ` +
    `rewrite the bullet or cite different evidence${exitHint}.`
  );
}

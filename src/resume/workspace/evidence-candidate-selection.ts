import { extractEvidenceNumbers } from "../evidence-numbers.js";
import type { AvailableEvidenceCandidate } from "../quality/types.js";
import type {
  BulletEvidenceBinding,
  SourceEvidenceExcerpt,
} from "../source-types.js";

/**
 * Deterministic candidate selection for evidence auto-repair. All choices
 * follow the stable candidate order so repairs are reproducible across runs.
 */
export function bestCoverageCandidate(
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  experienceId: string,
  missingNumbers: readonly string[],
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  used: readonly SourceEvidenceExcerpt[],
): AvailableEvidenceCandidate | undefined {
  let best: AvailableEvidenceCandidate | undefined;
  let bestCovered = 0;
  for (const candidate of candidates.values()) {
    if (candidate.experienceId !== experienceId) continue;
    if (conflictsWithUsed(work, used, candidate)) continue;
    const covered = missingNumbers.filter((value) =>
      extractEvidenceNumbers(candidate.sourceQuote).includes(value),
    ).length;
    if (covered > bestCovered) {
      best = candidate;
      bestCovered = covered;
      if (covered === missingNumbers.length) break;
    }
  }
  return best;
}

export function firstUnusedCandidate(
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  experienceId: string,
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  excluded?: SourceEvidenceExcerpt,
  used: readonly SourceEvidenceExcerpt[] = [],
): AvailableEvidenceCandidate | undefined {
  return [...candidates.values()].find(
    (candidate) =>
      candidate.experienceId === experienceId &&
      !(
        excluded !== undefined &&
        candidate.sourceStart === excluded.sourceStart &&
        candidate.sourceEnd === excluded.sourceEnd
      ) &&
      !used.some(
        (excerpt) =>
          excerpt.experienceId === candidate.experienceId &&
          excerpt.sourceStart < candidate.sourceEnd &&
          candidate.sourceStart < excerpt.sourceEnd,
      ) &&
      !conflictsWithWork(
        work,
        experienceId,
        candidate.sourceStart,
        candidate.sourceEnd,
      ),
  );
}

export function excerptFrom(
  candidate: AvailableEvidenceCandidate,
): SourceEvidenceExcerpt {
  return {
    experienceId: candidate.experienceId,
    revisionId: candidate.revisionId,
    revisionContentHash: candidate.revisionContentHash,
    sourceStart: candidate.sourceStart,
    sourceEnd: candidate.sourceEnd,
    sourceQuote: candidate.sourceQuote,
  };
}

function conflictsWithUsed(
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  used: readonly SourceEvidenceExcerpt[],
  candidate: AvailableEvidenceCandidate,
): boolean {
  return (
    conflictsWithWork(
      work,
      candidate.experienceId,
      candidate.sourceStart,
      candidate.sourceEnd,
    ) ||
    used.some(
      (excerpt) =>
        excerpt.experienceId === candidate.experienceId &&
        excerpt.sourceStart < candidate.sourceEnd &&
        candidate.sourceStart < excerpt.sourceEnd,
    )
  );
}

export function conflictsWithWork(
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  experienceId: string,
  start: number,
  end: number,
): boolean {
  return [...work.values()].some((binding) =>
    binding.excerpts.some(
      (excerpt) =>
        excerpt.experienceId === experienceId &&
        excerpt.sourceStart < end &&
        start < excerpt.sourceEnd,
    ),
  );
}

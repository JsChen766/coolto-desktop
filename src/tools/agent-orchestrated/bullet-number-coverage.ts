import { extractEvidenceNumbers } from "../../resume/evidence-numbers.js";
import { allEvidenceCandidates } from "../../resume/quality/evidence-candidates.js";

type EvidenceCandidate = ReturnType<typeof allEvidenceCandidates>[number];

export interface NumberCoverageExcerpt {
  experienceId: string;
  revisionId: string;
  revisionContentHash: string;
  sourceStart: number;
  sourceEnd: number;
  sourceQuote: string;
}

/** Extends a citation with same-experience evidence that covers missing numbers. */
export function coverMissingNumbers(
  candidates: Map<string, EvidenceCandidate>,
  experienceId: string | undefined,
  cited: readonly { sourceStart: number; sourceEnd: number }[],
  missing: readonly string[],
): NumberCoverageExcerpt[] {
  const added: NumberCoverageExcerpt[] = [];
  let remaining = [...missing];
  for (const candidate of candidates.values()) {
    if (experienceId && candidate.experienceId !== experienceId) continue;
    if (
      cited.some(
        (range) =>
          range.sourceStart < candidate.sourceEnd &&
          candidate.sourceStart < range.sourceEnd,
      )
    ) {
      continue;
    }
    const numbers = extractEvidenceNumbers(candidate.sourceQuote);
    const covers = remaining.filter((value) => numbers.includes(value));
    if (!covers.length) continue;
    added.push({
      experienceId: candidate.experienceId,
      revisionId: candidate.revisionId,
      revisionContentHash: candidate.revisionContentHash,
      sourceStart: candidate.sourceStart,
      sourceEnd: candidate.sourceEnd,
      sourceQuote: candidate.sourceQuote,
    });
    remaining = remaining.filter((value) => !covers.includes(value));
    if (!remaining.length) break;
  }
  return added;
}

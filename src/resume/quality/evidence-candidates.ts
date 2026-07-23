import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import { matchedRequirementIdsForText } from "./requirement-coverage.js";
import type { AvailableEvidenceCandidate } from "./types.js";

const MAX_AVAILABLE_EVIDENCE = 12;

export function rankAvailableEvidence(
  snapshot: ResumeSourceSnapshot,
  bindings: readonly BulletEvidenceBinding[],
): AvailableEvidenceCandidate[] {
  const consumed = bindings.flatMap((binding) =>
    binding.excerpts.map((excerpt) => ({
      experienceId: excerpt.experienceId,
      start: excerpt.sourceStart,
      end: excerpt.sourceEnd,
    })),
  );
  return snapshot.experiences
    .flatMap((experience) =>
      splitEvidence(experience.content).flatMap((range) => {
        if (
          consumed.some(
            (used) =>
              used.experienceId === experience.id &&
              overlaps(used.start, used.end, range.start, range.end),
          )
        ) {
          return [];
        }
        const matchedRequirementIds = matchedRequirementIdsForText(
          snapshot,
          range.text,
        );
        const reasons: string[] = [];
        let valueScore = matchedRequirementIds.length * 5;
        if (/\d/u.test(range.text)) {
          valueScore += 2;
          reasons.push("contains_grounded_number");
        }
        if (/[A-Za-z][A-Za-z0-9+#.-]{1,}/u.test(range.text)) {
          valueScore += 1;
          reasons.push("contains_technical_term");
        }
        if (range.text.length >= 24) {
          valueScore += 1;
          reasons.push("specific_source_detail");
        }
        if (matchedRequirementIds.length) reasons.push("jd_relevant");
        return [
          {
            experienceId: experience.id,
            revisionId: experience.revisionId,
            revisionContentHash: experience.contentHash,
            sourceStart: range.start,
            sourceEnd: range.end,
            sourceQuote: range.text,
            matchedRequirementIds,
            valueScore,
            valueReasons: reasons,
          },
        ];
      }),
    )
    .sort(
      (left, right) =>
        right.valueScore - left.valueScore ||
        left.experienceId.localeCompare(right.experienceId) ||
        left.sourceStart - right.sourceStart,
    )
    .slice(0, MAX_AVAILABLE_EVIDENCE);
}

function splitEvidence(content: string): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = [];
  const matcher = /[^。！？.!?\n]+[。！？.!?]?/gu;
  for (const match of content.matchAll(matcher)) {
    const raw = match[0];
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (text.length < 4 || match.index === undefined) continue;
    const start = match.index + leading;
    ranges.push({ start, end: start + text.length, text });
  }
  return ranges;
}

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

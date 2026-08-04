import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import { matchedRequirementIdsForText } from "./requirement-coverage.js";
import type { AvailableEvidenceCandidate } from "./types.js";

const MAX_AVAILABLE_EVIDENCE = 48;

/**
 * Model-facing evidence candidates. Every candidate carries a stable
 * `evidenceId` derived from its snapshot range, so the model can reference
 * exact source excerpts without transcribing quotes or UTF-16 offsets.
 */
export function allEvidenceCandidates(
  snapshot: ResumeSourceSnapshot,
): AvailableEvidenceCandidate[] {
  return snapshot.experiences
    .flatMap((experience) =>
      splitEvidence(experience.content).map((range) => {
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
        return {
          evidenceId: evidenceId(experience.id, range.start, range.end),
          experienceId: experience.id,
          revisionId: experience.revisionId,
          revisionContentHash: experience.contentHash,
          sourceStart: range.start,
          sourceEnd: range.end,
          sourceQuote: range.text,
          matchedRequirementIds,
          valueScore,
          valueReasons: reasons,
        };
      }),
    )
    .sort(
      (left, right) =>
        right.valueScore - left.valueScore ||
        left.experienceId.localeCompare(right.experienceId) ||
        left.sourceStart - right.sourceStart,
    );
}

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
  const candidates = allEvidenceCandidates(snapshot).filter(
    (candidate) =>
      !consumed.some(
        (used) =>
          used.experienceId === candidate.experienceId &&
          overlaps(used.start, used.end, candidate.sourceStart, candidate.sourceEnd),
      ),
  );
  const balanced = snapshot.experiences.flatMap((experience) =>
    candidates.find((candidate) => candidate.experienceId === experience.id) ?? [],
  );
  const selected = new Set(balanced.map((candidate) => candidate.evidenceId));
  return [
    ...balanced,
    ...candidates.filter((candidate) => !selected.has(candidate.evidenceId)),
  ].slice(0, Math.max(MAX_AVAILABLE_EVIDENCE, balanced.length));
}

export function evidenceId(experienceId: string, start: number, end: number): string {
  return `${experienceId}:${start}:${end}`;
}

export function parseEvidenceId(
  value: string,
): { experienceId: string; start: number; end: number } | undefined {
  const firstSeparator = value.indexOf(":");
  const lastSeparator = value.lastIndexOf(":");
  if (firstSeparator <= 0 || lastSeparator <= firstSeparator + 1) return undefined;
  const experienceId = value.slice(0, firstSeparator);
  const start = Number.parseInt(value.slice(firstSeparator + 1, lastSeparator), 10);
  const end = Number.parseInt(value.slice(lastSeparator + 1), 10);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    end <= start ||
    start < 0
  ) {
    return undefined;
  }
  return { experienceId, start, end };
}

function splitEvidence(content: string): Array<{ start: number; end: number; text: string }> {
  const ranges: Array<{ start: number; end: number; text: string }> = [];
  // A period only terminates a sentence when it is not a decimal point
  // (e.g. "GPA 3.3/4.0" stays one candidate; "done. Next" splits).
  const matcher = /[^。！？!?\n]+(?:[。！？!?\n]|(?<!\d)\.(?!\d))?/gu;
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

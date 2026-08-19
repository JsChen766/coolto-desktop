import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import { splitEvidenceRanges } from "../evidence-ranges.js";
import { matchedRequirementIdsForText } from "./requirement-coverage.js";
import type { AvailableEvidenceCandidate } from "./types.js";

const MAX_AVAILABLE_EVIDENCE = 48;
const MIN_BALANCED_EVIDENCE_PER_EXPERIENCE = 3;

/**
 * Model-facing evidence candidates. Every candidate carries a stable
 * `evidenceId` derived from its snapshot range, so the model can reference
 * exact source excerpts without transcribing quotes or UTF-16 offsets.
 */
export function allEvidenceCandidates(
  snapshot: ResumeSourceSnapshot,
): AvailableEvidenceCandidate[] {
  return structuralEvidenceCandidates(snapshot)
    .map((candidate) => {
      const matchedRequirementIds = matchedRequirementIdsForText(
        snapshot,
        candidate.sourceQuote,
      );
      const reasons: string[] = [];
      let valueScore = matchedRequirementIds.length * 5;
      if (/\d/u.test(candidate.sourceQuote)) {
        valueScore += 2;
        reasons.push("contains_grounded_number");
      }
      if (candidate.sourceQuote.length >= 24) {
        valueScore += 1;
        reasons.push("specific_source_detail");
      }
      if (matchedRequirementIds.length) reasons.push("jd_relevant");
      return {
        ...candidate,
        matchedRequirementIds,
        valueScore,
        valueReasons: reasons,
      };
    })
    .sort(
      (left, right) => right.valueScore - left.valueScore ||
        left.experienceId.localeCompare(right.experienceId) ||
        left.sourceStart - right.sourceStart,
    );
}

/** Exact source ranges in source order; the Agent owns all relevance ranking. */
export function structuralEvidenceCandidates(
  snapshot: ResumeSourceSnapshot,
): AvailableEvidenceCandidate[] {
  return snapshot.experiences
    .flatMap((experience) =>
      splitEvidenceRanges(experience.content).map((range) => ({
          evidenceId: evidenceId(experience.id, range.start, range.end),
          experienceId: experience.id,
          revisionId: experience.revisionId,
          revisionContentHash: experience.contentHash,
          sourceStart: range.start,
          sourceEnd: range.end,
          sourceQuote: range.text,
          matchedRequirementIds: [],
          valueScore: 0,
          valueReasons: [],
        })),
    );
}

/** Candidates that can support a standalone writer bullet without padding. */
export function writableEvidenceCandidates(
  snapshot: ResumeSourceSnapshot,
): AvailableEvidenceCandidate[] {
  return structuralEvidenceCandidates(snapshot).filter(
    (candidate) => !isStandaloneScalarEvidence(candidate.sourceQuote),
  );
}

/** A label plus one scalar is a useful fact, but not a standalone bullet. */
export function isStandaloneScalarEvidence(value: string): boolean {
  return /^[\p{L}\p{Script=Han}_ -]{1,24}[:：]\s*(?:\p{Sc}\s*)?[\d.,/+\-]+(?:\s*(?:%|[KMB]|万|亿))?\s*$/iu.test(
    value,
  );
}

export interface SlimEvidenceCandidate {
  evidenceId: string;
  sourceQuote: string;
  matchedRequirementIds: readonly string[];
}

/**
 * Model-facing candidate projection: only the stable ID, the exact quote the
 * model writes from, and the JD requirements it can cover. Offset arithmetic,
 * scoring internals and revision metadata stay out of the payload.
 */
export function slimEvidenceCandidates(
  candidates: readonly AvailableEvidenceCandidate[],
): SlimEvidenceCandidate[] {
  return candidates.map((candidate) => ({
    evidenceId: candidate.evidenceId,
    sourceQuote: candidate.sourceQuote,
    matchedRequirementIds: candidate.matchedRequirementIds,
  }));
}

export function rankAvailableEvidence(
  snapshot: ResumeSourceSnapshot,
  bindings: readonly BulletEvidenceBinding[],
  maximumEvidence = MAX_AVAILABLE_EVIDENCE,
): AvailableEvidenceCandidate[] {
  const consumed = bindings.flatMap((binding) =>
    binding.excerpts.map((excerpt) => ({
      experienceId: excerpt.experienceId,
      start: excerpt.sourceStart,
      end: excerpt.sourceEnd,
    })),
  );
  const candidates = writableEvidenceCandidates(snapshot).filter(
    (candidate) =>
      !consumed.some(
        (used) =>
          used.experienceId === candidate.experienceId &&
          overlaps(used.start, used.end, candidate.sourceStart, candidate.sourceEnd),
      ),
  );
  const byExperience = new Map(snapshot.experiences.map((experience) => [
    experience.id,
    candidates.filter((candidate) => candidate.experienceId === experience.id),
  ]));
  const balanced = Array.from(
    { length: MIN_BALANCED_EVIDENCE_PER_EXPERIENCE },
    (_, rank) => snapshot.experiences.flatMap((experience) =>
      byExperience.get(experience.id)?.[rank] ?? [],
    ),
  ).flat();
  const selected = new Set(balanced.map((candidate) => candidate.evidenceId));
  const ranked = [
    ...balanced,
    ...candidates.filter((candidate) => !selected.has(candidate.evidenceId)),
  ];
  return Number.isFinite(maximumEvidence)
    ? ranked.slice(0, Math.max(0, maximumEvidence))
    : ranked;
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

function overlaps(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

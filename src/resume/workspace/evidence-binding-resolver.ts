import { extractEvidenceNumbers } from "../evidence-numbers.js";
import { EvidenceValidationError } from "../evidence-validation.js";
import {
  allEvidenceCandidates,
  parseEvidenceId,
} from "../quality/evidence-candidates.js";
import type { AvailableEvidenceCandidate } from "../quality/types.js";
import type { BulletEvidenceBinding, ResumeSourceSnapshot } from "../source-types.js";
import type { EvidenceBindingInput } from "./types.js";

/**
 * Resolves model-facing `evidenceId` references against the immutable
 * snapshot's candidate index. Every cited ID must be a candidate generated
 * from snapshot content; all cited candidates must belong to one experience;
 * requirement coverage is derived deterministically from the cited candidates
 * instead of model-provided IDs.
 */
export function candidateMap(
  snapshot: ResumeSourceSnapshot,
): ReadonlyMap<string, AvailableEvidenceCandidate> {
  return new Map(
    allEvidenceCandidates(snapshot).map((candidate) => [
      candidate.evidenceId,
      candidate,
    ]),
  );
}

export function resolveExcerpts(
  input: EvidenceBindingInput,
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  sharedEvidence = false,
): Omit<BulletEvidenceBinding, "bulletId"> {
  const cited: AvailableEvidenceCandidate[] = [];
  const excerpts = input.evidenceIds.map((rawEvidenceId) => {
    const evidenceId = rawEvidenceId.trim();
    if (!parseEvidenceId(evidenceId)) {
      throw new EvidenceValidationError(
        "invalid_evidence_id",
        `Bullet cites a malformed evidenceId "${evidenceId}".`,
      );
    }
    const candidate = candidates.get(evidenceId);
    if (!candidate) {
      throw new EvidenceValidationError(
        "unknown_evidence_id",
        `Bullet cites unknown evidenceId "${evidenceId}"; copy evidenceId values verbatim from availableEvidence, never construct or extend them.`,
      );
    }
    cited.push(candidate);
    return {
      experienceId: candidate.experienceId,
      revisionId: candidate.revisionId,
      revisionContentHash: candidate.revisionContentHash,
      sourceStart: candidate.sourceStart,
      sourceEnd: candidate.sourceEnd,
      sourceQuote: candidate.sourceQuote,
    };
  });
  if (!excerpts.length) {
    throw new EvidenceValidationError(
      "missing_source_excerpt",
      "Every bullet must cite at least one evidenceId.",
    );
  }
  const sourceExperienceIds = [
    ...new Set(cited.map((candidate) => candidate.experienceId)),
  ];
  if (sourceExperienceIds.length > 1 && !sharedEvidence) {
    throw new EvidenceValidationError(
      "excerpt_experience_mismatch",
      `Bullet cites evidence from multiple experiences (${sourceExperienceIds.join(", ")}); every cited evidenceId must belong to one experience.`,
    );
  }
  return {
    sourceExperienceId: sourceExperienceIds[0]!,
    bulletText: input.bulletText,
    excerpts,
    matchedRequirementIds: [
      ...new Set(cited.flatMap((candidate) => candidate.matchedRequirementIds)),
    ],
  };
}

export function assertNoRangeConflicts(
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  incoming: BulletEvidenceBinding,
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
): void {
  for (const excerpt of incoming.excerpts) {
    const conflict = [...work.values()].some(
      (existing) =>
        existing.bulletId !== incoming.bulletId &&
        existing.excerpts.some(
          (used) =>
            used.experienceId === excerpt.experienceId &&
            used.sourceStart < excerpt.sourceEnd &&
            excerpt.sourceStart < used.sourceEnd,
        ),
    );
    if (!conflict) continue;
    const experienceId = excerpt.experienceId;
    const unused = [...candidates.values()]
      .filter(
        (candidate) =>
          candidate.experienceId === experienceId &&
          ![...work.values()].some((existing) =>
            existing.excerpts.some(
              (used) =>
                used.experienceId === experienceId &&
                used.sourceStart < candidate.sourceEnd &&
                candidate.sourceStart < used.sourceEnd,
            ),
          ),
      )
      .slice(0, 2)
      .map((candidate) => candidate.evidenceId);
    throw new EvidenceValidationError(
      "duplicate_source_range",
      `Bullet reuses source text already reserved by another bullet${
        unused.length
          ? `; unused evidence for this experience: ${unused.join(", ")}`
          : "; no unused evidence remains for this experience"
      }`,
      incoming.bulletId,
    );
  }
}

export function assertSupportedNumbers(
  bulletText: string,
  excerpts: BulletEvidenceBinding["excerpts"],
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
): void {
  const citedIds = new Set(
    excerpts.map(
      (excerpt) => `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
    ),
  );
  const sourceNumbers = extractEvidenceNumbers(
    excerpts.map((excerpt) => excerpt.sourceQuote).join("\n"),
  );
  const missing = [
    ...new Set(
      extractEvidenceNumbers(bulletText).filter(
        (value) => !sourceNumbers.includes(value),
      ),
    ),
  ];
  if (!missing.length) return;
  const hints = [...candidates.values()]
    .filter(
      (candidate) =>
        !citedIds.has(candidate.evidenceId) &&
        extractEvidenceNumbers(candidate.sourceQuote).some((value) =>
          missing.includes(value),
        ),
    )
    .slice(0, 2)
    .map((candidate) => candidate.evidenceId);
  throw new EvidenceValidationError(
    "unsupported_numeric_claim",
    `Bullet contains numbers absent from its cited source: ${missing.join(", ")}${hints.length ? `; cite one of these candidates instead: ${hints.join(", ")}` : ""}`,
  );
}

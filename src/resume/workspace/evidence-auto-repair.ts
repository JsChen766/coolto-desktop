import { extractEvidenceNumbers } from "../evidence-numbers.js";
import { EvidenceValidationError } from "../evidence-validation.js";
import { parseEvidenceId } from "../quality/evidence-candidates.js";
import type { AvailableEvidenceCandidate } from "../quality/types.js";
import type {
  BulletEvidenceBinding,
  ResumeSourceSnapshot,
  SourceEvidenceExcerpt,
} from "../source-types.js";
import { candidateMap, resolveExcerpts } from "./evidence-binding-resolver.js";
import {
  bestCoverageCandidate,
  conflictsWithWork,
  excerptFrom,
  firstUnusedCandidate,
} from "./evidence-candidate-selection.js";
import type { EvidenceBindingInput } from "./types.js";

const MAX_EXCERPTS_PER_BULLET = 8;

export interface EvidenceRepairAction {
  kind:
    | "number_coverage"
    | "range_conflict"
    | "unknown_evidence_id"
    | "tail_fill"
    | "section_fill";
  action: "added" | "replaced";
  bulletId: string;
  evidenceIds: string[];
}

export interface ResolvedBindingWithRepair {
  binding: BulletEvidenceBinding;
  repairs: EvidenceRepairAction[];
}

/**
 * Resolves the model-proposed binding and mechanically repairs the two
 * failure classes that dominate retries:
 * - numbers absent from the cited quotes are covered by adding unused
 *   candidates of the same experience that contain them;
 * - ranges already reserved by another bullet are replaced with unused
 *   candidates of the same experience.
 * Only genuinely unsupported claims fail (with a single-step instruction),
 * so failed tool calls drop from dozens per run to at most a few.
 */
export function resolveBindingWithAutoRepair(
  snapshot: ResumeSourceSnapshot,
  input: EvidenceBindingInput,
  bulletId: string,
  work: ReadonlyMap<string, BulletEvidenceBinding>,
): ResolvedBindingWithRepair {
  const candidates = candidateMap(snapshot);
  const repairs: EvidenceRepairAction[] = [];
  const repairedInput = repairUnknownEvidenceIds(input, candidates, work, bulletId, repairs);
  const resolved = resolveExcerpts(repairedInput, candidates);
  const workWithoutSelf = new Map(work);
  workWithoutSelf.delete(bulletId.trim());

  const deduped = dedupeExcerpts(resolved.excerpts);
  const conflictFree = repairRangeConflicts(
    deduped,
    resolved.sourceExperienceId,
    workWithoutSelf,
    candidates,
    bulletId,
    repairs,
  );
  const { excerpts, unmatched } = addNumberCoverage(
    bulletId,
    input.bulletText,
    conflictFree,
    resolved.sourceExperienceId,
    workWithoutSelf,
    candidates,
    repairs,
  );
  if (unmatched.length) {
    throw new EvidenceValidationError(
      "unsupported_numeric_claim",
      `Bullet ${bulletId} contains numbers absent from any unused source text: ${unmatched.join(", ")}. Remove the number or rewrite it to match the cited source.`,
      bulletId,
    );
  }
  const matchedRequirementIds = [
    ...new Set(
      excerpts.flatMap((excerpt) =>
        candidates.get(
          `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
        )?.matchedRequirementIds ?? [],
      ),
    ),
  ];
  return {
    binding: {
      bulletId: bulletId.trim(),
      sourceExperienceId: resolved.sourceExperienceId,
      bulletText: input.bulletText,
      excerpts,
      matchedRequirementIds,
    },
    repairs,
  };
}

/**
 * Replaces well-formed but unknown evidenceIds with the highest-value unused
 * candidate of the same experience. The model sometimes fabricates IDs from
 * the visible format; treating them as intent (not failure) removes the
 * fabricated-ID retry loop. Numbers and claim gates still verify the final
 * binding, so a wrong substitution cannot bypass quality.
 */
function repairUnknownEvidenceIds(
  input: EvidenceBindingInput,
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  bulletId: string,
  repairs: EvidenceRepairAction[],
): EvidenceBindingInput {
  let changed = false;
  const used: SourceEvidenceExcerpt[] = [];
  const repairedIds = input.evidenceIds.map((rawId) => {
    const id = rawId.trim();
    if (candidates.has(id)) {
      const candidate = candidates.get(id)!;
      used.push(excerptFrom(candidate));
      return id;
    }
    const parsed = parseEvidenceId(id);
    if (!parsed) return id;
    const replacement = firstUnusedCandidate(
      candidates,
      parsed.experienceId,
      work,
      undefined,
      used,
    );
    if (!replacement) return id;
    changed = true;
    used.push(excerptFrom(replacement));
    repairs.push({
      kind: "unknown_evidence_id",
      action: "replaced",
      bulletId,
      evidenceIds: [replacement.evidenceId],
    });
    return replacement.evidenceId;
  });
  if (!changed) return input;
  return { bulletText: input.bulletText, evidenceIds: repairedIds };
}

function dedupeExcerpts(
  excerpts: readonly SourceEvidenceExcerpt[],
): SourceEvidenceExcerpt[] {
  const seen = new Set<string>();
  return excerpts.filter((excerpt) => {
    const key = `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function repairRangeConflicts(
  excerpts: readonly SourceEvidenceExcerpt[],
  experienceId: string,
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  bulletId: string,
  repairs: EvidenceRepairAction[],
): SourceEvidenceExcerpt[] {
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
        `Bullet ${bulletId} reuses source text reserved by another bullet and no unused evidence remains for its experience; rewrite the bullet or cite different evidence.`,
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

function addNumberCoverage(
  bulletId: string,
  bulletText: string,
  excerpts: readonly SourceEvidenceExcerpt[],
  experienceId: string,
  work: ReadonlyMap<string, BulletEvidenceBinding>,
  candidates: ReadonlyMap<string, AvailableEvidenceCandidate>,
  repairs: EvidenceRepairAction[],
): { excerpts: SourceEvidenceExcerpt[]; unmatched: string[] } {
  const citedText = excerpts
    .map((excerpt) => excerpt.sourceQuote)
    .join("\n");
  const sourceNumbers = extractEvidenceNumbers(citedText);
  let remaining = [
    ...new Set(
      extractEvidenceNumbers(bulletText).filter(
        (value) => !sourceNumbers.includes(value),
      ),
    ),
  ];
  const added: SourceEvidenceExcerpt[] = [];
  const capacity = Math.max(0, MAX_EXCERPTS_PER_BULLET - excerpts.length);
  for (let guard = 0; guard < capacity && remaining.length; guard += 1) {
    const candidate = bestCoverageCandidate(
      candidates,
      experienceId,
      remaining,
      work,
      [...excerpts, ...added],
    );
    if (!candidate) break;
    added.push(excerptFrom(candidate));
    repairs.push({
      kind: "number_coverage",
      action: "added",
      bulletId,
      evidenceIds: [candidate.evidenceId],
    });
    remaining = remaining.filter(
      (value) => !extractEvidenceNumbers(candidate.sourceQuote).includes(value),
    );
  }
  return { excerpts: [...excerpts, ...added], unmatched: remaining };
}

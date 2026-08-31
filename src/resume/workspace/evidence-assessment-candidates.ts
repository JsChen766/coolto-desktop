import {
  isStandaloneScalarEvidence,
  writableEvidenceCandidates,
} from "../quality/evidence-candidates.js";
import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import type { ResumeWorkspace } from "./types.js";

export function assessmentCandidates(workspace: ResumeWorkspace) {
  const itemExperienceIds = new Set(workspace.structure.sections.flatMap(
    (section) => section.items.flatMap((item) =>
      item.source_experience_id && workspace.itemTiers?.[item.id]
        ? [item.source_experience_id] : []
    ),
  ));
  const endDateById = new Map(workspace.sourceSnapshot.experiences.map(
    (experience) => [experience.id, experience.endDate ?? null],
  ));
  const source = writableEvidenceCandidates(workspace.sourceSnapshot)
    .filter((candidate) => itemExperienceIds.has(candidate.experienceId))
    .map((candidate) => ({
      ...candidate,
      endDate: endDateById.get(candidate.experienceId) ?? null,
    }));
  const supplemental = (workspace.supplementalEvidence ?? [])
    .filter((entry) => itemExperienceIds.has(entry.experienceId) &&
      !isStandaloneScalarEvidence(entry.text))
    .map((entry) => ({
      evidenceId: entry.evidenceId,
      experienceId: entry.experienceId,
      sourceQuote: entry.text,
      endDate: endDateById.get(entry.experienceId) ?? null,
    }));
  return [...source, ...supplemental];
}

export function usedEvidenceIds(workspace: ResumeWorkspace): Set<string> {
  return new Set((workspace.bulletProvenance ?? [])
    .flatMap((entry) => entry.evidenceIds));
}

export function recencyKey(candidate: { endDate: string | null }): string {
  return candidate.endDate === "present" ? "9999-12-31" : candidate.endDate ?? "";
}

export function hasSafeEvidenceCapacity(workspace: ResumeWorkspace): boolean {
  const compile = workspace.compileResult;
  return compile.pageCount === 1 &&
    compile.overflowPx <= RESUME_LAYOUT_TOLERANCE_PX &&
    compile.usedHeightPx + RESUME_LAYOUT_TOLERANCE_PX <
      compile.availableHeightPx * RESUME_DEFAULT_TARGET_USAGE_RATIO;
}

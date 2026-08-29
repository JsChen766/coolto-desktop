import { groundedAdditionTargets } from "./grounded-addition-targets.js";
import { itemLineWriteTargets } from "./item-line-plan.js";
import {
  RESUME_DEFAULT_TARGET_USAGE_RATIO,
  RESUME_LAYOUT_TOLERANCE_PX,
} from "../compiler-types.js";
import type { ResumeWorkspace } from "./types.js";
import { selectedEvidenceIds } from "./evidence-assessment.js";

/** A workspace without a published/local base is being written from scratch. */
export function isFirstResumeGeneration(workspace: ResumeWorkspace): boolean {
  return !workspace.reuseBase;
}

/** Real source facts that can still become standalone bullets. */
export function unusedGroundedEvidenceCount(
  workspace: ResumeWorkspace,
): number {
  const selected = selectedEvidenceIds(workspace);
  if (selected) return selected.size;
  const writableItems = new Set(Object.keys(workspace.itemTiers ?? {}));
  return groundedAdditionTargets(workspace, Number.POSITIVE_INFINITY)
    .filter((target) => writableItems.has(target.itemId)).length;
}

/** First generation must consume safe grounded work before asking for more. */
export function hasPendingFirstGenerationGroundedWork(
  workspace: ResumeWorkspace,
): boolean {
  if (!isFirstResumeGeneration(workspace)) return false;
  return itemLineWriteTargets(workspace).some(
    (target) => target.currentBullets.length === 0,
  );
}

/** Neutral wording is a final closure tool, never a substitute for real facts. */
export function factNeutralClosureActive(
  workspace: ResumeWorkspace,
): boolean {
  if (!workspace.factNeutralAuthorization) return false;
  if (!isFirstResumeGeneration(workspace)) return true;
  if (workspace.evidenceAssessment) {
    return workspace.evidenceAssessment.phase === "neutral_closure";
  }
  return itemLineWriteTargets(workspace).length === 0 &&
    (
      unusedGroundedEvidenceCount(workspace) === 0 ||
      !hasSafeFirstGenerationPageCapacity(workspace)
    );
}

/** The 95% target is the last safe point for adding another grounded bullet. */
function hasSafeFirstGenerationPageCapacity(
  workspace: ResumeWorkspace,
): boolean {
  const compile = workspace.compileResult;
  if (compile.pageCount !== 1 || compile.overflowPx > RESUME_LAYOUT_TOLERANCE_PX) {
    return false;
  }
  const targetHeight =
    compile.availableHeightPx * RESUME_DEFAULT_TARGET_USAGE_RATIO;
  return compile.usedHeightPx + RESUME_LAYOUT_TOLERANCE_PX < targetHeight;
}

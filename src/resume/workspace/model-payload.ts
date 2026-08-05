import type { ResumeCompileViolation } from "../compiler-types.js";
import {
  rankAvailableEvidence,
  slimEvidenceCandidates,
} from "../quality/evidence-candidates.js";
import { calculateResumeBudget, requirementCoverage } from "./candidate-budget.js";
import { unwrittenExperienceItemIds } from "./candidate-content.js";
import type { ResumeWorkspace } from "./types.js";
import {
  bulletTailDiagnostics,
  idIndex,
  instructionFor,
  overflowDiagnostic,
  resumeVisibleText,
  writePlan,
} from "./workspace-projection.js";

/**
 * Model-facing payload for resume workspace tool results. Keeps only what the
 * model writes from (stable IDs, full visibleText, ranked unused evidence,
 * budget and diagnostics); drops binding excerpts, per-candidate scoring
 * internals and raw bullet measurements that the model never reads.
 */
export function buildModelPayload(workspace: ResumeWorkspace): object {
  return {
    candidateId: workspace.candidateId,
    revision: workspace.revision,
    status: workspace.status,
    sourceFingerprint: workspace.sourceSnapshot.sourceFingerprint,
    structure: idIndex(workspace.structure),
    visibleText: resumeVisibleText(workspace.structure),
    evidenceBindings: compactEvidenceBindings(workspace),
    availableEvidence: slimEvidenceCandidates(
      rankAvailableEvidence(workspace.sourceSnapshot, workspace.bindings),
    ),
    requirementCoverage: requirementCoverage(
      workspace.sourceSnapshot,
      workspace.bindings,
    ),
    budget: calculateResumeBudget(workspace.compileResult),
    compile: compactCompile(workspace.compileResult),
    contentDiagnostics: {
      unwrittenExperienceItemIds: unwrittenExperienceItemIds(workspace.structure),
    },
    bulletTailDiagnostics: bulletTailDiagnostics(workspace),
    overflowDiagnostic: overflowDiagnostic(workspace),
    writePlan: writePlan(workspace),
    quality: workspace.qualityReport ?? null,
    repairRound: workspace.repairRound,
    repairRoundsRemaining: Math.max(0, 3 - workspace.repairRound),
    repairHistory: workspace.repairHistory,
    operationReport: workspace.lastOperationReport ?? null,
    bestSnapshot: compactBestSnapshot(workspace),
    instruction: instructionFor(workspace),
  };
}

function compactEvidenceBindings(workspace: ResumeWorkspace): Array<{
  bulletId: string;
  evidenceIds: string[];
}> {
  return workspace.bindings.map((binding) => ({
    bulletId: binding.bulletId,
    evidenceIds: binding.excerpts.map(
      (excerpt) =>
        `${excerpt.experienceId}:${excerpt.sourceStart}:${excerpt.sourceEnd}`,
    ),
  }));
}

function compactCompile(result: ResumeWorkspace["compileResult"]): object {
  return {
    qualified: result.qualified,
    usageRatio: result.usageRatio,
    overflowPx: result.overflowPx,
    violations: result.violations.map(compactViolation),
  };
}

function compactViolation(violation: ResumeCompileViolation): object {
  return {
    code: violation.code,
    message: violation.message,
    ...(violation.bulletId ? { bulletId: violation.bulletId } : {}),
  };
}

function compactBestSnapshot(workspace: ResumeWorkspace): object {
  return {
    revision: workspace.bestSnapshot.revision,
    qualified:
      workspace.bestSnapshot.compileResult.qualified &&
      unwrittenExperienceItemIds(workspace.bestSnapshot.structure).length === 0 &&
      (workspace.bestSnapshot.qualityReport?.passed ?? false),
    layoutQualified: workspace.bestSnapshot.compileResult.qualified,
    qualityQualified: workspace.bestSnapshot.qualityReport?.passed ?? false,
    usageRatio: workspace.bestSnapshot.compileResult.usageRatio,
    violationCodes: workspace.bestSnapshot.compileResult.violations.map(
      (violation) => violation.code,
    ),
  };
}

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
    reuseBase: workspace.reuseBase ?? null,
    continuation: continuationState(workspace),
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
    layoutBudget: workspace.layoutBudget ?? null,
    budget: calculateResumeBudget(workspace.compileResult),
    typography: typographyDiagnostic(workspace),
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
    operationOutcome: workspace.lastOperationReport ?? null,
    operationReport: workspace.lastOperationReport ?? null,
    bestSnapshot: compactBestSnapshot(workspace),
    instruction: instructionFor(workspace),
  };
}

function continuationState(workspace: ResumeWorkspace): object {
  if (workspace.status === "ready_for_approval") {
    return { continuable: false, reason: "ready_for_approval" };
  }
  if (workspace.status === "needs_user_decision") {
    const evidenceRemaining = rankAvailableEvidence(
      workspace.sourceSnapshot,
      workspace.bindings,
    ).length;
    return {
      continuable: false,
      reason: evidenceRemaining === 0
        ? "evidence_exhausted"
        : "user_decision_required",
    };
  }
  return { continuable: true, reason: null };
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

/**
 * Measured typography facts (host measures, the agent decides). The bullet
 * tail gate requires the last line of every bullet to use more than 70% of
 * the available line width; charsPerLine lets the agent pick a tail-aware
 * target length when writing: for an n-line bullet aim at
 * (n-1)*charsPerLine + 0.75*charsPerLine characters (last line ~75% full).
 */
function typographyDiagnostic(workspace: ResumeWorkspace): object {
  const result = workspace.compileResult;
  const widthPx =
    result.bullets[0]?.availableLineWidthPx ??
    (workspace.structure.language === "zh-CN" ? 711 : 900);
  const fontSize = result.bodyFontSizePx > 0 ? result.bodyFontSizePx : 13;
  const charsPerLine =
    workspace.structure.language === "zh-CN"
      ? Math.max(20, Math.round(widthPx / fontSize))
      : Math.max(30, Math.round((widthPx / fontSize) * 1.9));
  return {
    charsPerLine,
    availableLineWidthPx: round(widthPx),
    bodyFontSizePx: fontSize,
    lineHeightPx: result.bodyLineHeightPx,
    bulletTailGateRatio: 0.7,
  };
}

function round(value: number): number {
  return Number(value.toFixed(2));
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

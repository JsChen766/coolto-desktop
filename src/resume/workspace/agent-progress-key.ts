import { createHash } from "node:crypto";

import type { ResumeWorkspace } from "./types.js";
import { pendingAugmentedContent } from "./augmentation-state.js";

/**
 * Identifies the measured quality state of a resume write. Rewording that
 * changes the rendered result advances the key; revision-only churn does not.
 */
export function resumeContentProgressKey(workspace: ResumeWorkspace): string {
  const compile = workspace.compileResult;
  const bulletTexts = new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, bullet.text] as const)
    )
  ));
  const measuredState = {
    status: workspace.status,
    pageCount: compile.pageCount,
    overflowPx: compile.overflowPx,
    usedHeightPx: compile.usedHeightPx,
    usageRatio: compile.usageRatio,
    itemCounts: workspace.structure.sections.flatMap((section) =>
      section.items.map((item) => ({
        itemId: item.id,
        tier: workspace.itemTiers?.[item.id] ?? null,
        bulletIds: item.bullets.map((bullet) => bullet.id),
      })),
    ),
    bullets: compile.bullets.map((bullet) => ({
      bulletId: bullet.bulletId,
      text: bulletTexts.get(bullet.bulletId) ?? null,
      lineCount: bullet.lineCount,
      lastLineWidthPx: bullet.lastLineWidthPx,
      lastLineRatio: bullet.lastLineRatio,
      passed: bullet.passed,
    })),
    violations: compile.violations.map((violation) => ({
      code: violation.code,
      bulletId: violation.bulletId ?? null,
    })),
    supplementalEvidence: (workspace.supplementalEvidence ?? []).map(
      (entry) => ({
        evidenceId: entry.evidenceId,
        experienceId: entry.experienceId,
      }),
    ),
    pendingConfirmation: pendingAugmentedContent(workspace).map((entry) => ({
      bulletId: entry.bulletId,
      kind: entry.kind,
      text: entry.text,
    })),
    reuseAdaptation: workspace.reuseAdaptation ? {
      status: workspace.reuseAdaptation.status,
      adaptedItemIds: workspace.reuseAdaptation.adaptedItemIds,
      uncoveredRequirementIds:
        workspace.reuseAdaptation.uncoveredRequirementIds,
    } : null,
    evidenceAssessment: workspace.evidenceAssessment ? {
      phase: workspace.evidenceAssessment.phase,
      round: workspace.evidenceAssessment.round,
      decisions: Object.entries(workspace.evidenceAssessment.decisions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([evidenceId, decision]) => ({
          evidenceId,
          status: decision.status,
          assessmentRound: decision.assessmentRound,
        })),
    } : null,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(measuredState))
    .digest("hex");
  return `resume_content_apply:${digest}`;
}

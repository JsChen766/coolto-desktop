import { createHash } from "node:crypto";

import { resumeContentProgressKey } from "./agent-progress-key.js";
import type { WorkspaceOperationReceipt } from "./agent-workspace-view.js";
import type { ResumeWorkspace } from "./types.js";

/**
 * Rejected item writes never count as product progress. The full rejection
 * details remain in the tool receipt for repair, while the governor only
 * observes formal content and measured layout changes.
 */
export function resumeWriteLoopGuardKey(
  workspace: ResumeWorkspace,
  operation?: WorkspaceOperationReceipt,
): string {
  const base = resumeContentProgressKey(workspace);
  if (operation?.status !== "rejected") return base;
  return base;
}

/** Finite domain recovery state may advance without changing formal content. */
export function resumeTailRepairLoopGuardKey(
  workspace: ResumeWorkspace,
): string {
  const base = resumeContentProgressKey(workspace);
  const state = workspace.tailRepairProgress;
  if (!state) return base;
  const recovery = {
    stalled: state.stalled,
    bullets: Object.entries(state.byBulletId).sort(([left], [right]) =>
      left.localeCompare(right)
    ).map(([bulletId, progress]) => ({
      bulletId,
      mode: progress.mode ?? "growth",
      rejectedGrowths: progress.consecutiveRejects ??
        progress.zeroProgressRounds ?? 0,
      reflowAttempts: progress.reflowAttempts ?? 0,
      failureType: progress.lastFailureType ?? null,
      workingLastLineRatio: progress.workingLastLineRatio ?? null,
    })),
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(recovery))
    .digest("hex");
  return `${base}:tail_recovery:${digest}`;
}

/** Page-fill recovery advances even when a measured insertion adds no line. */
export function resumePageFillLoopGuardKey(
  workspace: ResumeWorkspace,
): string {
  const base = resumeContentProgressKey(workspace);
  const rounds = workspace.pageFillProgress?.consecutiveZeroGrowthRounds ?? 0;
  return `${base}:page_fill_recovery:${rounds}`;
}

import { createHash } from "node:crypto";

import { resumeContentProgressKey } from "./agent-progress-key.js";
import type { WorkspaceOperationReceipt } from "./agent-workspace-view.js";
import type { ResumeWorkspace } from "./types.js";

/**
 * Rejected item writes do not advance the workspace revision. Give the turn
 * governor a stable signature of the remaining validation failures so a
 * shrinking/changing error set is progress, while paraphrasing into the same
 * failure set still counts toward the no-progress limit.
 */
export function resumeWriteLoopGuardKey(
  workspace: ResumeWorkspace,
  operation?: WorkspaceOperationReceipt,
): string {
  const base = resumeContentProgressKey(workspace);
  if (operation?.status !== "rejected") return base;
  const failures = operation.rejectedItems.map((item) => ({
    itemId: item.itemId,
    ...(item.errors?.length
      ? {
          errors: item.errors.map((error) => ({
            bulletIndex: error.bulletIndex,
            bulletId: error.bulletId,
            code: error.code,
          })),
        }
      : { reason: item.reason }),
  }));
  const digest = createHash("sha256")
    .update(JSON.stringify(failures))
    .digest("hex");
  return `${base}:items_rejected:${digest}`;
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
    })),
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(recovery))
    .digest("hex");
  return `${base}:tail_recovery:${digest}`;
}

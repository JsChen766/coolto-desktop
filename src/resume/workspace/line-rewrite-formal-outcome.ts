import type { WorkspaceOperationReceipt } from "./agent-workspace-view.js";
import type {
  LineRewriteDiagnostics,
  LineRewriteFeedback,
} from "./line-rewrite-selector.js";
import type { ResumeWorkspace } from "./types.js";

/** Reconciles Chromium selection with the authoritative content write. */
export function formalLineRewriteOutcome(
  workspace: ResumeWorkspace,
  diagnostics: LineRewriteDiagnostics,
  operation: WorkspaceOperationReceipt,
): { diagnostics: LineRewriteDiagnostics; warning?: string } {
  const itemByBullet = new Map(workspace.structure.sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.bullets.map((bullet) => [bullet.id, item.id] as const),
    ),
  ));
  const appliedItems = new Set(operation.appliedItemIds);
  const rejectedItems = new Map(
    operation.rejectedItems.map((item) => [item.itemId, item]),
  );
  const feedback = diagnostics.feedback.map((entry) => {
    if (entry.status === "rejected") return entry;
    const itemId = itemByBullet.get(entry.bulletId);
    if (itemId && appliedItems.has(itemId)) return entry;
    return formalRejection(entry, rejectedItems.get(itemId ?? ""));
  });
  const applied = feedback.filter((entry) => entry.status === "applied");
  const rejected = feedback.filter((entry) => entry.status === "rejected");
  const reconciled: LineRewriteDiagnostics = {
    ...diagnostics,
    appliedRewriteCount: applied.length,
    stackedProgressCount: applied.filter((entry) =>
      entry.progressType === "stacked"
    ).length,
    heightGrowthCount: applied.filter((entry) =>
      entry.progressType === "height_growth"
    ).length,
    skippedRewriteCount: rejected.length,
    feedback,
  };
  const warning = rejected.length
    ? rejected.map((entry) =>
        `${entry.bulletId}: ${entry.reason ?? "本批未正式应用"}`
      ).join("；")
    : undefined;
  return { diagnostics: reconciled, ...(warning ? { warning } : {}) };
}

function formalRejection(
  entry: LineRewriteFeedback,
  rejected: WorkspaceOperationReceipt["rejectedItems"][number] | undefined,
): LineRewriteFeedback {
  const error = rejected?.errors?.find((candidate) =>
    candidate.bulletId === entry.bulletId
  );
  const reason = error
    ? `正式内容校验未通过（${error.code}）：${error.message}`
    : `正式内容校验未通过：${rejected?.reason ?? "改写未落地"}`;
  return {
    bulletId: entry.bulletId,
    status: "rejected",
    failureType: "content_validation_failed",
    reason: `${reason}；保留最新 currentText，只修正该问题后重新扩写一次`,
  };
}

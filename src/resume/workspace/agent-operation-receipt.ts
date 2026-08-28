import type { WorkspaceOperationReceipt } from "./agent-workspace-view.js";

export function workspaceOperationReceipt(
  appliedItemIds: string[],
  rejectedItems: WorkspaceOperationReceipt["rejectedItems"],
): WorkspaceOperationReceipt {
  return {
    status: appliedItemIds.length
      ? rejectedItems.length ? "partial_success" : "success"
      : "rejected",
    appliedItemIds,
    rejectedItems,
  };
}

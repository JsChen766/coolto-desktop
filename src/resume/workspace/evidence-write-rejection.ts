import type { AgentItemContentInput } from "./agent-content-types.js";
import { rejectSelectedEvidence } from "./evidence-assessment.js";
import type { WorkspaceOperationReceipt } from "./agent-workspace-view.js";
import type { ResumeWorkspace } from "./types.js";
import type { ResumeWorkspaceStore } from "./workspace-store.js";

export function persistRejectedSelectedEvidence(
  store: ResumeWorkspaceStore,
  workspace: ResumeWorkspace,
  items: readonly AgentItemContentInput[],
  rejectedItems: WorkspaceOperationReceipt["rejectedItems"],
): ResumeWorkspace {
  const evidenceIds = items.flatMap((item) =>
    item.bullets.flatMap((bullet) => bullet.evidenceIds ?? [])
  );
  const updated = rejectSelectedEvidence(
    workspace,
    evidenceIds,
    rejectedItems.map((item) => item.reason).join(" | ").slice(0, 240),
  );
  return updated === workspace
    ? workspace
    : store.replace(updated, workspace.revision);
}

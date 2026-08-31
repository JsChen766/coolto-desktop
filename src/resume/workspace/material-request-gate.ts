import type { ResumeWorkspace } from "./types.js";

/** Legacy compatibility: new item-lines workspaces never create count gates. */
export function applyBulletCountMaterialGate(
  workspace: ResumeWorkspace,
): ResumeWorkspace {
  if (workspace.lineBudgetVersion !== "item-lines-v1") return workspace;
  if (workspace.materialRequest?.kind !== "bullet_count_insufficient") {
    return workspace;
  }
  return clearBulletCountRequest(workspace);
}

function clearBulletCountRequest(workspace: ResumeWorkspace): ResumeWorkspace {
  if (workspace.materialRequest?.kind !== "bullet_count_insufficient") {
    return workspace;
  }
  const resumed = { ...workspace, status: "writing" as const };
  delete resumed.materialRequest;
  return resumed;
}

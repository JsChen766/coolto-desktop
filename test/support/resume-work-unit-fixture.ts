import { buildAgentWorkspaceView } from
  "../../src/resume/workspace/agent-workspace-view.js";
import {
  applyResumeWorkUnitInputs,
  workUnitGroupingAction,
} from "../../src/resume/workspace/work-unit-map.js";
import type { ResumeWorkspace } from
  "../../src/resume/workspace/types.js";
import { ResumeWorkspaceStore } from
  "../../src/resume/workspace/workspace-store.js";

/** Keeps legacy tests focused on their original concern; WorkUnit behavior has dedicated tests. */
export function completeFixtureWorkUnits(store: ResumeWorkspaceStore) {
  const workspace = store.latest()!;
  const action = workUnitGroupingAction(workspace);
  if (!action) return workspace;
  return store.replace(applyResumeWorkUnitInputs(
    workspace,
    action.itemTargets.map((target) => ({
      itemId: target.itemId,
      units: target.evidence.map((entry, index) => ({
        label: `fixture-unit-${index + 1}`,
        kind: "responsibility" as const,
        evidenceIds: [entry.evidenceId],
      })),
    })),
  ), workspace.revision);
}

export function fixtureCreationPayload(
  store: ResumeWorkspaceStore,
  original: Record<string, unknown>,
) {
  const workspace = completeFixtureWorkUnits(store);
  return { ...original, ...buildAgentWorkspaceView(workspace) };
}

export function withFixtureWorkUnits<
  T extends {
    origin: string;
    evidenceIds?: readonly string[];
    workUnitIds?: string[];
  },
>(workspace: ResumeWorkspace, bullet: T): T & { workUnitIds?: string[] } {
  if (bullet.workUnitIds) return { ...bullet, workUnitIds: [...bullet.workUnitIds] };
  if (bullet.origin !== "grounded" || workspace.workUnitMap?.status !== "ready") {
    return bullet as T & { workUnitIds?: string[] };
  }
  const evidence = new Set(bullet.evidenceIds ?? []);
  const workUnitIds = workspace.workUnitMap.units.filter((unit) =>
    unit.evidenceIds.every((id) => evidence.has(id)) &&
    unit.evidenceIds.some((id) => evidence.has(id))
  ).map((unit) => unit.workUnitId);
  return { ...bullet, workUnitIds };
}

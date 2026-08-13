import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import type { ResumeCandidateReviewer } from "../../resume/quality/candidate-reviewer.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { createInspectResumeDraftTool } from "./inspect-draft.js";
import { createPrepareResumeDraftTool } from "./prepare-draft.js";
import { createWriteBulletTool } from "./write-bullet.js";

export interface AgentOrchestratedDependencies {
  snapshotBuilder: ResumeSourceSnapshotBuilder;
  compiler: ResumeCompiler;
  store: ResumeWorkspaceStore;
  reviewer?: ResumeCandidateReviewer;
}

/**
 * Agent-orchestrated generation tools: the agent creates the draft skeleton,
 * authors every bullet itself through parallel write_bullet calls, and
 * inspects real compile diagnostics to drive its own layout, expansion and
 * finishing decisions. The host only validates and measures.
 */
export function createAgentOrchestratedTools(
  dependencies: AgentOrchestratedDependencies,
): AgentTool[] {
  return [
    createPrepareResumeDraftTool(
      dependencies.snapshotBuilder,
      dependencies.compiler,
      dependencies.store,
    ),
    createWriteBulletTool(dependencies.store),
    createInspectResumeDraftTool(
      dependencies.compiler,
      dependencies.store,
      dependencies.reviewer,
    ),
  ];
}

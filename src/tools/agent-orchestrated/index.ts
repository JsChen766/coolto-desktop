import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { ApprovalManager } from "../../approvals/approval-manager.js";
import type { ResumeExperienceSyncProposalPort } from "../../resume/material/experience-sync-port.js";
import type { ResumeSourceSnapshotBuilder } from "../../resume/source-snapshot.js";
import type { ResumeCompiler } from "../../resume/workspace/compiler-port.js";
import { ResumeWorkspaceStore } from "../../resume/workspace/workspace-store.js";
import { createApplyResumeContentTool } from "./apply-content.js";
import { createAddResumeMaterialTool } from "./add-material.js";
import { createResumeWorkspaceTool } from "./create-workspace.js";
import { createGetResumeWorkspaceTool } from "./get-workspace.js";
import { createPrepareExperienceSyncTool } from "./prepare-experience-sync.js";
import { createPauseResumeForMaterialTool } from "./pause-for-material.js";

export interface AgentOrchestratedDependencies {
  snapshotBuilder: ResumeSourceSnapshotBuilder;
  compiler: ResumeCompiler;
  store: ResumeWorkspaceStore;
  currentUserMessageTimestamp?: () => number | undefined;
  approvalManager?: ApprovalManager;
  experienceSyncProposals?: ResumeExperienceSyncProposalPort;
}

/**
 * Minimal resume-generation surface. The agent selects sources and authors
 * complete item batches; the host locks data, validates structure/evidence,
 * and returns real layout measurements.
 */
export function createAgentOrchestratedTools(
  dependencies: AgentOrchestratedDependencies,
): AgentTool[] {
  return [
    createResumeWorkspaceTool(
      dependencies.snapshotBuilder,
      dependencies.compiler,
      dependencies.store,
    ),
    createGetResumeWorkspaceTool(dependencies.store),
    createPauseResumeForMaterialTool(dependencies.store),
    createApplyResumeContentTool(
      dependencies.compiler,
      dependencies.store,
      dependencies.approvalManager,
    ),
    createAddResumeMaterialTool(
      dependencies.store,
      dependencies.currentUserMessageTimestamp ?? (() => undefined),
    ),
    ...(dependencies.approvalManager && dependencies.experienceSyncProposals
      ? [
          createPrepareExperienceSyncTool(
            dependencies.store,
            dependencies.experienceSyncProposals,
            dependencies.approvalManager,
          ),
        ]
      : []),
  ];
}

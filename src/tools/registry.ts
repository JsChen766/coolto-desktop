import type { AgentTool } from "@earendil-works/pi-agent-core";

import type {
  CurrentUserReader,
  ExperienceReader,
} from "../api/types.js";
import { ApprovalManager } from "../approvals/approval-manager.js";
import { SelectedFileRegistry } from "../files/selected-file-registry.js";
import { ExperienceImportProposalStore } from "../import/proposal-store.js";
import { createGetExperienceTool } from "./get-experience.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createPrepareExperienceImportTool } from "./import-experiences/prepare-import.js";
import { createRuntimeInfoTool } from "./runtime-info.js";
import { createSearchExperiencesTool } from "./search-experiences.js";
import { createSelectedFileTools } from "./selected-files.js";

export interface ToolRegistryDependencies {
  currentUserReader?: CurrentUserReader;
  experienceReader?: ExperienceReader;
  importProposalStore?: ExperienceImportProposalStore;
  approvalManager?: ApprovalManager;
  selectedFileRegistry?: SelectedFileRegistry;
}

/**
 * This is the only place where tools are exposed to the model.
 * Business tools will be added here after their API adapters and policies exist.
 */
export function createToolRegistry(
  dependencies: ToolRegistryDependencies = {},
): AgentTool[] {
  const businessTools: AgentTool[] = [];

  if (dependencies.currentUserReader) {
    businessTools.push(
      createGetCurrentUserTool(dependencies.currentUserReader),
    );
  }
  if (dependencies.experienceReader) {
    businessTools.push(
      createSearchExperiencesTool(dependencies.experienceReader),
      createGetExperienceTool(dependencies.experienceReader),
    );
  }
  if (
    dependencies.experienceReader &&
    dependencies.importProposalStore &&
    dependencies.approvalManager
  ) {
    businessTools.push(
      createPrepareExperienceImportTool(
        dependencies.experienceReader,
        dependencies.importProposalStore,
        dependencies.approvalManager,
      ),
    );
  }
  if (dependencies.selectedFileRegistry) {
    businessTools.push(
      ...createSelectedFileTools(dependencies.selectedFileRegistry),
    );
  }

  return [
    createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
    ...businessTools,
  ];
}

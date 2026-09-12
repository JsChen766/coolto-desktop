import type { AgentTool } from "@earendil-works/pi-agent-core";

import { createGetExperienceTool } from "./get-experience.js";
import { createSearchExperiencesTool } from "./search-experiences.js";
import { createExperienceMaterialTools } from "./experience-material-tools.js";
import { createPrepareExperienceMaintenanceTool } from
  "./prepare-experience-maintenance.js";
import { appendMaterialProductTools } from "./material-product-tools.js";
import type { ToolRegistryDependencies } from "./registry.js";

export function createExperienceTools(
  dependencies: ToolRegistryDependencies,
): AgentTool[] {
  if (!dependencies.experienceReader) return [];
  const tools: AgentTool[] = [
    createSearchExperiencesTool(dependencies.experienceReader),
    createGetExperienceTool(dependencies.experienceReader),
  ];
  if (dependencies.experienceMaterialIngestion) tools.push(
    ...createExperienceMaterialTools({
      store: dependencies.experienceMaterialIngestion,
      experiences: dependencies.experienceReader,
    }),
  );
  const maintenance = dependencies.agentOrchestrated?.experienceSyncProposals;
  if (maintenance && dependencies.agentOrchestrated?.approvalManager) {
    tools.push(createPrepareExperienceMaintenanceTool(
      maintenance, dependencies.agentOrchestrated.approvalManager,
    ));
  }
  appendMaterialProductTools(tools, dependencies.materialHost);
  return tools;
}

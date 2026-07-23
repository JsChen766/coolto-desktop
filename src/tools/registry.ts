import type { AgentTool } from "@earendil-works/pi-agent-core";

import type {
  CurrentUserReader,
  ExperienceReader,
} from "../api/types.js";
import { createGetExperienceTool } from "./get-experience.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createRuntimeInfoTool } from "./runtime-info.js";
import { createSearchExperiencesTool } from "./search-experiences.js";

export interface ToolRegistryDependencies {
  currentUserReader?: CurrentUserReader;
  experienceReader?: ExperienceReader;
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

  return [
    createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
    ...businessTools,
  ];
}

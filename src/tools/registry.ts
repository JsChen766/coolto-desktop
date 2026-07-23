import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { CurrentUserReader } from "../api/types.js";
import { createGetCurrentUserTool } from "./get-current-user.js";
import { createRuntimeInfoTool } from "./runtime-info.js";

export interface ToolRegistryDependencies {
  currentUserReader?: CurrentUserReader;
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

  return [
    createRuntimeInfoTool(businessTools.map((tool) => tool.name)),
    ...businessTools,
  ];
}

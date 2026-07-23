import type { AgentTool } from "@earendil-works/pi-agent-core";

import { createRuntimeInfoTool } from "./runtime-info.js";

/**
 * This is the only place where tools are exposed to the model.
 * Business tools will be added here after their API adapters and policies exist.
 */
export function createToolRegistry(): AgentTool[] {
  return [createRuntimeInfoTool()];
}

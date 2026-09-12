import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { MaterialHostPort } from "../material/material-host-contract.js";
import {
  createMaterialToolAdapter,
  type MaterialCapabilityAgentTool,
} from "../material/material-tool-adapter.js";

export function createMaterialProductTools(host: MaterialHostPort): MaterialCapabilityAgentTool[] {
  return createMaterialToolAdapter(host);
}

export function appendMaterialProductTools(
  businessTools: AgentTool[],
  host?: MaterialHostPort,
): void {
  if (!host) return;
  businessTools.push(...createMaterialProductTools(host));
}

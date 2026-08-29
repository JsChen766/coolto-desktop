import type { AgentTool } from "@earendil-works/pi-agent-core";

const AGENT_TASK_LIFECYCLE_TOOLS = new Set([
  "task_checkpoint",
  "task_wait",
  "task_need_user",
  "task_complete",
]);
const AGENT_TASK_BOOTSTRAP_TOOLS = new Set([
  "prepare_agent_task",
  "request_write_access",
]);

export function toolsForConversationRun<T extends AgentTool>(
  tools: T[],
  managedTask: boolean,
): T[] {
  return managedTask
    ? tools.filter((tool) => !AGENT_TASK_BOOTSTRAP_TOOLS.has(tool.name))
    : tools.filter((tool) => !AGENT_TASK_LIFECYCLE_TOOLS.has(tool.name));
}

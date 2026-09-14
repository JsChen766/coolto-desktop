import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { AgentTaskV1 } from "../../../agent-task/task-types.js";
import type { CapabilityAgentTool } from "../../../tools/tool-capabilities.js";

const AGENT_TASK_LIFECYCLE_TOOLS = new Set([
  "task_checkpoint", "task_wait", "task_need_user", "task_complete",
]);
const AGENT_TASK_BOOTSTRAP_TOOLS = new Set([
  "prepare_agent_task", "prepare_resume_job_loop", "prepare_mail_schedule_loop",
  "prepare_follow_up_loop", "prepare_interview_briefing_loop", "prepare_strategy_loop",
  "prepare_risk_deadline_loop", "request_write_access",
]);
const PROFILE_TOOLS = new Set([
  "get_current_user", "get_user_profile", "prepare_profile_update",
  "get_preferences", "resolve_preferences",
]);
const PREFERENCE_TOOLS = new Set([
  "get_user_profile", "get_preferences", "resolve_preferences",
  "prepare_preference_change",
]);
const DISCOVERY_BLOCKED_PREFIXES = ["browser_", "fetch_inbox", "read_inbox", "list_inbox", "capture_browser_mail"];
const DISCOVERY_BLOCKED = new Set([
  "request_write_access", "browser_submit", "prepare_application_submission",
  "sync_submission_receipt", "confirm_submission_receipt", "record_inbox_signal",
  "prepare_inbox_application_update", "prepare_inbox_interview_update", "prepare_agent_task",
  "sync_now", "list_mail_connections", "search_application_candidates", "fetch_job_source",
  "recognize_recruiting_page", "get_application_loop_context", "get_application_strategy_metrics",
  "record_follow_up_draft", "record_interview_brief", "record_strategy_proposal",
  "record_risk_notice", "prepare_loop_reminder",
  "prepare_resume_job_loop", "prepare_mail_schedule_loop", "prepare_follow_up_loop",
  "prepare_interview_briefing_loop", "prepare_strategy_loop", "prepare_risk_deadline_loop",
  "task_checkpoint", "task_wait", "task_need_user", "task_complete",
]);

export type ConversationToolContext = "discovery" | "profile" | "preference" | "resume" | "browser";

export interface ManagedConversationToolScope {
  capabilityProfile: AgentTaskV1["capabilityProfile"];
  allowedActions: readonly string[];
}

export function contextForManagedTask(
  capabilityProfile: ManagedConversationToolScope["capabilityProfile"],
): ConversationToolContext {
  return capabilityProfile === "browser_enhance" ? "browser" : "discovery";
}

export function toolsForConversationRun<T extends AgentTool>(
  tools: T[],
  managedTask: boolean | ManagedConversationToolScope,
  context: ConversationToolContext = "discovery",
): T[] {
  const isManaged = typeof managedTask === "boolean" ? managedTask : true;
  const allowedActions = typeof managedTask === "object"
    ? new Set(managedTask.allowedActions)
    : isManaged ? new Set<string>() : undefined;
  const lifecycleFiltered = isManaged
    ? tools.filter((tool) => !AGENT_TASK_BOOTSTRAP_TOOLS.has(tool.name))
    : tools.filter((tool) => !AGENT_TASK_LIFECYCLE_TOOLS.has(tool.name));
  if (context === "profile") {
    return lifecycleFiltered.filter((tool) => (PROFILE_TOOLS.has(tool.name) ||
      (isManaged && AGENT_TASK_LIFECYCLE_TOOLS.has(tool.name))) &&
      (!isManaged || isManagedToolAllowed(tool, allowedActions!)));
  }
  if (context === "preference") {
    return lifecycleFiltered.filter((tool) => (PREFERENCE_TOOLS.has(tool.name) ||
      (isManaged && AGENT_TASK_LIFECYCLE_TOOLS.has(tool.name))) &&
      (!isManaged || isManagedToolAllowed(tool, allowedActions!)));
  }
  if (isManaged) return lifecycleFiltered.filter((tool) => isManagedToolAllowed(tool, allowedActions!));
  if (context === "browser") return lifecycleFiltered.filter((tool) =>
    tool.name === "extract_page" || tool.name.startsWith("browser_") ||
    tool.name === "recognize_recruiting_page");
  if (context === "resume") return lifecycleFiltered.filter((tool) => !isDiscoveryBlocked(tool.name));
  return lifecycleFiltered.filter((tool) => !isDiscoveryBlocked(tool.name));
}

function isManagedToolAllowed(tool: AgentTool, allowedActions: ReadonlySet<string>): boolean {
  const capability = (tool as Partial<CapabilityAgentTool>).capability;
  if (AGENT_TASK_LIFECYCLE_TOOLS.has(tool.name)) return allowedActions.has("task.lifecycle");
  return Boolean(capability?.requiredScopes.length &&
    capability.requiredScopes.every((scope) => allowedActions.has(scope)));
}

function isDiscoveryBlocked(name: string): boolean {
  return DISCOVERY_BLOCKED.has(name) || DISCOVERY_BLOCKED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

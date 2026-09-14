import type { AgentHarnessServices } from "./agent-harness-services.js";
import {
  CAPABILITY_STAGES,
  type CapabilityStage,
  type ProfilePreferenceContextSnapshot,
} from "./stage-policy.js";

export function createTaskStageAdvancer(
  services: AgentHarnessServices,
  ownerId: string,
  conversationId: string,
  authority: () => ProfilePreferenceContextSnapshot | undefined,
): (to: CapabilityStage, reason: string) => Promise<void> {
  return async (to, reason) => {
    const task = await services.tasks.findRunningByConversation(conversationId);
    if (!task?.activeRunId) return;
    const active = await services.grants.getActive(task.id);
    if (!active.grant?.stagePolicy) return;
    const current = services.stages.current(task.id, task.activeRunId);
    if (!current || current.stage === "wait" ||
        CAPABILITY_STAGES.indexOf(to) <= CAPABILITY_STAGES.indexOf(current.stage)) return;
    const context = authority();
    await services.transitionStage({
      ownerId, taskId: task.id, runId: task.activeRunId,
      grantHash: active.grant.contentHash, to, reason,
      profileVersion: context?.profileVersion ?? null,
      preferenceResolutionHash: context?.resolutionHash ?? null,
    });
  };
}

export async function advanceTaskStageAfterObservation(
  services: AgentHarnessServices,
  conversationId: string,
  toolName: string,
  isError: boolean,
): Promise<void> {
  if (isError || !OBSERVATION_TOOLS.has(toolName)) return;
  const task = await services.tasks.findRunningByConversation(conversationId);
  if (!task?.activeRunId) return;
  const active = await services.grants.getActive(task.id);
  const stage = services.stages.current(task.id, task.activeRunId);
  if (!active.grant?.stagePolicy || stage?.stage !== "observe") return;
  const context = await services.profilePreferenceContext?.();
  await services.transitionStage({
    ownerId: task.ownerId, taskId: task.id, runId: task.activeRunId,
    grantHash: active.grant.contentHash, to: "prepare",
    profileVersion: context?.profileVersion ?? null,
    preferenceResolutionHash: context?.resolutionHash ?? null,
    reason: "host_observation_completed",
  });
}

export async function advanceTaskStageAfterAction(
  services: AgentHarnessServices,
  conversationId: string,
  receiptRecorded: boolean,
): Promise<void> {
  if (!receiptRecorded) return;
  const task = await services.tasks.findRunningByConversation(conversationId);
  if (!task?.activeRunId) return;
  const active = await services.grants.getActive(task.id);
  const stage = services.stages.current(task.id, task.activeRunId);
  if (!active.grant?.stagePolicy || stage?.stage !== "approved_action") return;
  const context = await services.profilePreferenceContext?.();
  await services.transitionStage({
    ownerId: task.ownerId, taskId: task.id, runId: task.activeRunId,
    grantHash: active.grant.contentHash, to: "reconcile",
    profileVersion: context?.profileVersion ?? null,
    preferenceResolutionHash: context?.resolutionHash ?? null,
    reason: "host_action_receipt_recorded",
  });
}

export async function advanceTaskStageAfterApproval(
  services: AgentHarnessServices,
  taskId: string,
  runId: string,
): Promise<void> {
  const task = await services.tasks.get(taskId);
  const active = await services.grants.getActive(taskId);
  const stage = services.stages.current(taskId, runId);
  if (!active.grant?.stagePolicy || !stage || stage.stage === "wait") return;
  const context = await services.profilePreferenceContext?.();
  const transition = {
    ownerId: task.ownerId, taskId, runId,
    grantHash: active.grant.contentHash,
    profileVersion: context?.profileVersion ?? null,
    preferenceResolutionHash: context?.resolutionHash ?? null,
  };
  if (stage.stage === "observe") {
    await services.transitionStage({
      ...transition, to: "prepare", reason: "host_approval_prepare_boundary",
    });
  }
  const current = services.stages.current(taskId, runId);
  if (current?.stage === "prepare") {
    await services.transitionStage({
      ...transition, to: "approved_action", reason: "host_approval_accepted",
    });
  }
}

const OBSERVATION_TOOLS = new Set([
  "browser_snapshot", "browser_list_tabs", "browser_get_active_tab",
  "browser_query_elements", "browser_recruiting_form_observe",
  "get_current_user", "get_user_profile", "get_preferences", "resolve_preferences",
  "get_jd", "search_jds", "get_experience", "search_experiences", "get_resume",
  "list_job_leads", "fetch_inbox_events", "read_inbox_event", "list_inbox_signals",
  "search_application_candidates", "get_application_loop_context", "get_answer_vault",
]);

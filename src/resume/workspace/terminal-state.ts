import { resumeGenerationReadiness } from "./generation-readiness.js";
import type { ResumeWorkspace } from "./types.js";

export type ResumeTerminalKind =
  | "running"
  | "ready_for_approval"
  | "needs_user_decision"
  | "stopped";

export interface ResumeAuthoritativeQualitySignal {
  passed: boolean;
  revision: number;
  observedRevision: number | undefined;
  blockerCodes: string[];
}

export interface ResumeTerminalState {
  kind: ResumeTerminalKind;
  candidateId: string;
  revision: number;
  continueAutomatically: boolean;
  canResumeWithUser: boolean;
  reason?: string;
  requestId?: string;
}

/** The current mechanical readiness result, not the retired semantic report. */
export function authoritativeResumeQualitySignal(
  workspace: ResumeWorkspace,
): ResumeAuthoritativeQualitySignal {
  const readiness = resumeGenerationReadiness(workspace);
  return {
    passed: readiness.ready,
    revision: workspace.revision,
    observedRevision: workspace.compileObservedRevision,
    blockerCodes: readiness.blockers.map((blocker) => blocker.code),
  };
}

/** Derives terminal state from current gates, never from persisted status alone. */
export function resolveResumeTerminalState(
  workspace: ResumeWorkspace,
): ResumeTerminalState {
  const request = workspace.materialRequest;
  if (request?.status === "declined") {
    return state(workspace, "stopped", request.resolution ?? "user_stopped_questions", false, false);
  }
  let qualitySignal: ResumeAuthoritativeQualitySignal | undefined;
  try {
    qualitySignal = authoritativeResumeQualitySignal(workspace);
  } catch {
    return state(workspace, "needs_user_decision", "invalid_workspace_state", true, false);
  }
  if (request?.status === "awaiting_response") {
    return state(workspace, "needs_user_decision", "awaiting_user_response", true,
      false, request.id);
  }
  if (qualitySignal?.passed) return state(workspace, "ready_for_approval", undefined, false, false);
  if (workspace.status === "needs_user_decision" ||
    workspace.status === "ready_for_approval") {
    return state(workspace, "needs_user_decision", "current_gates_not_satisfied", true,
      false, request?.id);
  }
  return state(workspace, "running", undefined, true, true);
}

export function resumeTerminalInstruction(state: ResumeTerminalState): string {
  if (state.kind === "ready_for_approval") {
    return "当前简历已达到交付门槛；停止工具调用。";
  }
  if (state.kind === "stopped") {
    return "停止工具调用；保留当前最好草稿，不得再次追问材料。";
  }
  if (state.kind === "needs_user_decision") {
    return "停止工具调用；等待用户处理当前简历缺口，不得隐藏续接或重复追问。";
  }
  return "当前简历仍可继续处理；只执行最新权威 nextAction。";
}

function state(
  workspace: ResumeWorkspace,
  kind: ResumeTerminalKind,
  reason: string | undefined,
  canResumeWithUser: boolean,
  continueAutomatically: boolean,
  requestId?: string,
): ResumeTerminalState {
  return {
    kind,
    candidateId: workspace.candidateId,
    revision: workspace.revision,
    continueAutomatically,
    canResumeWithUser,
    ...(reason ? { reason } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

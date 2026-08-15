import type { Ref } from "vue";

import type {
  ConversationDetail,
  DesktopAgentEvent,
  DesktopApprovalRequest,
} from "@desktop/types";
import type { ToolRun } from "../components/ToolActivity.vue";
import { desktopErrorMessage } from "./desktop-error-message";
import type { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";
import type { useJdArtifacts } from "./use-jd-artifacts";
import type { useMatchReports } from "./use-match-reports";

interface AgentEventState {
  current: Ref<ConversationDetail | undefined>;
  running: Ref<boolean>;
  streamingText: Ref<string>;
  runError: Ref<string | undefined>;
  toolRuns: Ref<ToolRun[]>;
  pendingApproval: Ref<DesktopApprovalRequest | undefined>;
  approvalBusy: Ref<boolean>;
  approvalByConversation: Map<string, DesktopApprovalRequest>;
  jd: ReturnType<typeof useJdArtifacts>;
  match: ReturnType<typeof useMatchReports>;
  resumeWorkspace: ReturnType<typeof useResumeWorkspace>;
}

export function createAgentEventHandler(state: AgentEventState) {
  return (conversationId: string, event: DesktopAgentEvent): void => {
    if (event.type === "approval.required") {
      state.approvalByConversation.set(conversationId, event.request);
      if (conversationId === state.current.value?.id) {
        state.pendingApproval.value = event.request;
      }
      return;
    }
    if (event.type === "approval.resolved") {
      state.approvalByConversation.delete(conversationId);
      if (
        conversationId === state.current.value?.id &&
        state.pendingApproval.value?.id === event.requestId
      ) {
        state.pendingApproval.value = undefined;
      }
      if (event.decision === "reject") {
        state.jd.updateStatus(conversationId, event.requestId, "rejected");
      }
      return;
    }
    if (event.type === "jd.proposal.created") {
      state.jd.add(conversationId, event.data);
      return;
    }
    if (event.type === "jd.saved") {
      state.jd.updateStatus(
        conversationId,
        event.approvalRequestId,
        "saved",
        event.jdId,
      );
      return;
    }
    if (event.type === "match.report.created") {
      state.match.add(conversationId, event.data);
      return;
    }
    if (event.type === "approval.executing") {
      if (state.pendingApproval.value?.id === event.requestId) {
        state.approvalBusy.value = true;
      }
      return;
    }
    if (event.type === "approval.completed") {
      if (state.pendingApproval.value?.id === event.requestId) {
        state.approvalBusy.value = false;
      }
      const details = event.details as { jdId?: string } | undefined;
      if (details?.jdId) {
        state.jd.updateStatus(
          conversationId,
          event.requestId,
          "saved",
          details.jdId,
        );
      }
      return;
    }
    if (conversationId !== state.current.value?.id) return;
    handleCurrentConversationEvent(state, event);
  };
}

function handleCurrentConversationEvent(
  state: AgentEventState,
  event: DesktopAgentEvent,
): void {
  switch (event.type) {
    case "run.started":
      state.running.value = true;
      return;
    case "message.delta":
      state.streamingText.value += event.text;
      return;
    case "tool.started": {
      const argumentsValue = event.arguments as { label?: string } | undefined;
      state.toolRuns.value.push({
        callId: event.callId,
        name: event.name,
        ...(argumentsValue?.label ? { label: argumentsValue.label } : {}),
        status: "running",
      });
      return;
    }
    case "tool.completed": {
      const run = state.toolRuns.value.find(
        (candidate) => candidate.callId === event.callId,
      );
      if (run) run.status = event.isError ? "error" : "completed";
      return;
    }
    case "resume.draft.updated":
      void state.resumeWorkspace.openDraft(event.artifactId);
      return;
    case "approval.failed":
    case "run.failed":
      state.approvalBusy.value = false;
      state.runError.value = desktopErrorMessage(event.message);
      if (event.type === "run.failed") state.running.value = false;
      return;
    case "run.completed":
      state.running.value = false;
      return;
    default:
      return;
  }
}

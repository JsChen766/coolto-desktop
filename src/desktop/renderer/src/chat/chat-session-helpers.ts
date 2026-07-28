import type { Ref } from "vue";

import { latestNewAssistantMessageId } from "@desktop/artifact-anchor";
import type {
  ConversationDetail,
  DesktopApprovalRequest,
} from "@desktop/types";
import type { ToolRun } from "../components/ToolActivity.vue";
import type { useJdArtifacts } from "./use-jd-artifacts";
import type { useMatchReports } from "./use-match-reports";

export function createRunStateReset(state: {
  streamingText: Ref<string>;
  toolRuns: Ref<ToolRun[]>;
  runError: Ref<string | undefined>;
  pendingApproval: Ref<DesktopApprovalRequest | undefined>;
  approvalBusy: Ref<boolean>;
}) {
  const clearLiveResponse = (): void => {
    state.streamingText.value = "";
    state.toolRuns.value = [];
  };
  const clearRunState = (): void => {
    clearLiveResponse();
    state.runError.value = undefined;
    state.pendingApproval.value = undefined;
    state.approvalBusy.value = false;
  };
  return { clearLiveResponse, clearRunState };
}

export function createArtifactAnchorer(
  current: Ref<ConversationDetail | undefined>,
  jd: ReturnType<typeof useJdArtifacts>,
  match: ReturnType<typeof useMatchReports>,
) {
  return (
    conversationId: string,
    previousMessageIds: ReadonlySet<string>,
  ): void => {
    if (!current.value || current.value.id !== conversationId) return;
    const messageId = latestNewAssistantMessageId(
      current.value.messages,
      previousMessageIds,
    );
    jd.anchorPending(conversationId, messageId);
    match.anchorPending(conversationId, messageId);
  };
}

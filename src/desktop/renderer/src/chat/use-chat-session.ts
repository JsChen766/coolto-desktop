import { onBeforeUnmount, onMounted, ref } from "vue";

import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DesktopApprovalDecision,
  DesktopApprovalRequest,
  JdChatReference,
  ResumeChatReference,
} from "@desktop/types";
import type { ToolRun } from "../components/ToolActivity.vue";
import { desktopApi } from "../lib/desktop-api";
import type { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";
import { findReusableEmptyConversation } from "./conversation-list";
import { useJdArtifacts } from "./use-jd-artifacts";
import { useMatchReports } from "./use-match-reports";
import { createAgentEventHandler } from "./agent-event-handler";
import {
  createArtifactAnchorer,
  createRunStateReset,
  optimisticUserMessage,
} from "./chat-session-helpers";
import { desktopErrorMessage } from "./desktop-error-message";
import { useChatAuth } from "./use-chat-auth";

type ResumeWorkspace = ReturnType<typeof useResumeWorkspace>;

export function useChatSession(resumeWorkspace: ResumeWorkspace) {
  const conversations = ref<ConversationSummary[]>([]);
  const current = ref<ConversationDetail>();
  const running = ref(false);
  const streamingText = ref("");
  const runError = ref<string>();
  const toolRuns = ref<ToolRun[]>([]);
  const pendingApproval = ref<DesktopApprovalRequest>();
  const approvalBusy = ref(false);
  const dialog = ref<{
    mode: "rename" | "delete";
    conversation: ConversationSummary;
  }>();
  const jd = useJdArtifacts();
  const match = useMatchReports();
  const approvalByConversation = new Map<string, DesktopApprovalRequest>();
  let creatingConversation = false;
  let unsubscribeEvents: (() => void) | undefined;
  const { clearLiveResponse, clearRunState } = createRunStateReset({
    streamingText,
    toolRuns,
    runError,
    pendingApproval,
    approvalBusy,
  });
  const anchorResponseArtifacts = createArtifactAnchorer(current, jd, match);
  const auth = useChatAuth(loadConversations, clearAuthenticatedState, cancelRunning);
  const handleAgentEvent = createAgentEventHandler({
    current,
    running,
    streamingText,
    runError,
    toolRuns,
    pendingApproval,
    approvalBusy,
    approvalByConversation,
    jd,
    match,
    resumeWorkspace,
  });

  onMounted(async () => {
    unsubscribeEvents = desktopApi.agent.onEvent(handleAgentEvent);
    await auth.restore();
  });

  onBeforeUnmount(() => unsubscribeEvents?.());

  async function cancelRunning(): Promise<void> {
    if (running.value) await desktopApi.agent.cancel();
  }

  function clearAuthenticatedState(): void {
    current.value = undefined;
    conversations.value = [];
    approvalByConversation.clear();
    jd.clear();
    match.clear();
    clearRunState();
    resumeWorkspace.clear();
  }

  async function loadConversations(): Promise<void> {
    conversations.value = await desktopApi.conversations.list();
    await resumeWorkspace.loadDrafts();
    const first = conversations.value[0];
    if (first) await selectConversation(first.id);
    else await createConversation();
  }

  async function refreshConversationList(): Promise<void> {
    conversations.value = await desktopApi.conversations.list();
  }

  async function createConversation(): Promise<void> {
    if (running.value || creatingConversation) return;
    const reusable = findReusableEmptyConversation(conversations.value);
    if (reusable) {
      await selectConversation(reusable.id);
      return;
    }
    creatingConversation = true;
    try {
      current.value = await desktopApi.conversations.create();
      clearRunState();
      pendingApproval.value = undefined;
      jd.switchConversation(current.value?.id);
      match.switchConversation(current.value?.id);
      await refreshConversationList();
    } finally {
      creatingConversation = false;
    }
  }

  async function selectConversation(conversationId: string): Promise<void> {
    if (running.value || current.value?.id === conversationId) return;
    current.value = await desktopApi.conversations.get(conversationId);
    clearRunState();
    pendingApproval.value = approvalByConversation.get(conversationId);
    jd.switchConversation(conversationId);
    match.switchConversation(conversationId);
  }

  function openDialog(
    mode: "rename" | "delete",
    conversation: ConversationSummary,
  ): void {
    dialog.value = { mode, conversation };
  }

  async function confirmDialog(value?: string): Promise<void> {
    const active = dialog.value;
    if (!active) return;
    if (active.mode === "rename") {
      await desktopApi.conversations.rename({
        conversationId: active.conversation.id,
        title: value?.trim() ?? "",
      });
      if (current.value?.id === active.conversation.id && value?.trim()) {
        current.value.title = value.trim();
      }
    } else {
      await desktopApi.conversations.delete(active.conversation.id);
      approvalByConversation.delete(active.conversation.id);
      if (current.value?.id === active.conversation.id) current.value = undefined;
    }
    dialog.value = undefined;
    await refreshConversationList();
    if (!current.value) {
      const next = conversations.value[0];
      if (next) await selectConversation(next.id);
      else await createConversation();
    }
  }

  async function send(
    text: string,
    resumeReference?: ResumeChatReference,
    jdReference?: JdChatReference,
  ): Promise<void> {
    if (!current.value || running.value) return;
    const conversationId = current.value.id;
    const previousMessageIds = new Set(
      current.value.messages.map((message) => message.id),
    );
    current.value.messages.push(optimisticUserMessage(text));
    running.value = true;
    streamingText.value = "";
    runError.value = undefined;
    toolRuns.value = [];
    pendingApproval.value = undefined;
    try {
      current.value = await desktopApi.agent.prompt({
        conversationId,
        text,
        ...(resumeReference ? { resumeReference } : {}),
        ...(jdReference ? { jdReference } : {}),
      });
      anchorResponseArtifacts(conversationId, previousMessageIds);
      clearLiveResponse();
      await refreshConversationList();
      await resumeWorkspace.refreshActive();
    } catch (error: unknown) {
      runError.value = desktopErrorMessage(error);
    } finally {
      running.value = false;
    }
  }

  async function resolveApproval(
    decision: DesktopApprovalDecision,
  ): Promise<void> {
    if (!current.value || !pendingApproval.value) return;
    const conversationId = current.value.id;
    const previousMessageIds = new Set(
      current.value.messages.map((message) => message.id),
    );
    approvalBusy.value = true;
    try {
      current.value = await desktopApi.agent.resolveApproval({
        conversationId,
        requestId: pendingApproval.value.id,
        decision: JSON.parse(JSON.stringify(decision)),
      });
      anchorResponseArtifacts(conversationId, previousMessageIds);
      clearLiveResponse();
      pendingApproval.value = undefined;
      await refreshConversationList();
    } catch (error: unknown) {
      runError.value = desktopErrorMessage(error);
    } finally {
      approvalBusy.value = false;
    }
  }

  return {
    ...auth,
    conversations,
    current,
    running,
    streamingText,
    runError,
    toolRuns,
    pendingApproval,
    approvalBusy,
    dialog,
    jdArtifacts: jd.jdArtifacts,
    activeJd: jd.activeJd,
    matchReports: match.matchReports,
    activeMatchReport: match.activeMatchReport,
    createConversation,
    selectConversation,
    openDialog,
    confirmDialog,
    send,
    resolveApproval,
    openJdDetail: jd.openDetail,
    openMatchDetail: match.openDetail,
  };
}

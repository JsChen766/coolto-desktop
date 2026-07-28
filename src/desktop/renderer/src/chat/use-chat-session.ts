import { onBeforeUnmount, onMounted, ref } from "vue";

import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DesktopAgentEvent,
  DesktopApprovalDecision,
  DesktopApprovalRequest,
  DesktopUser,
  EmailChallengeView,
  ResumeChatReference,
} from "@desktop/types";
import type { ToolRun } from "../components/ToolActivity.vue";
import { desktopApi } from "../lib/desktop-api";
import type { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";
import { useJdArtifacts } from "./use-jd-artifacts";
import { useMatchReports } from "./use-match-reports";
import { latestNewAssistantMessageId } from "@desktop/artifact-anchor";

type ResumeWorkspace = ReturnType<typeof useResumeWorkspace>;

export function useChatSession(resumeWorkspace: ResumeWorkspace) {
  const booting = ref(true);
  const user = ref<DesktopUser>();
  const loginBusy = ref(false);
  const loginError = ref<string>();
  const emailChallenge = ref<EmailChallengeView>();
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
  let unsubscribeEvents: (() => void) | undefined;

  onMounted(async () => {
    unsubscribeEvents = desktopApi.agent.onEvent(handleAgentEvent);
    try {
      user.value = await desktopApi.auth.getCurrentUser();
      if (user.value) await loadConversations();
    } catch (error: unknown) {
      loginError.value = errorMessage(error);
    } finally {
      booting.value = false;
    }
  });

  onBeforeUnmount(() => unsubscribeEvents?.());

  async function login(email: string, password: string): Promise<void> {
    loginBusy.value = true;
    loginError.value = undefined;
    try {
      user.value = await desktopApi.auth.login(email, password);
      await loadConversations();
    } catch (error: unknown) {
      loginError.value = errorMessage(error);
    } finally {
      loginBusy.value = false;
    }
  }

  async function requestEmailCode(email: string): Promise<void> {
	loginBusy.value = true;
	loginError.value = undefined;
	try {
		emailChallenge.value = await desktopApi.auth.requestEmailCode(email);
	} catch (error: unknown) {
		loginError.value = errorMessage(error);
	} finally {
		loginBusy.value = false;
	}
  }

  async function verifyEmailCode(
	email: string,
	challengeId: string,
	code: string,
  ): Promise<void> {
	loginBusy.value = true;
	loginError.value = undefined;
	try {
		user.value = await desktopApi.auth.verifyEmailCode(email, challengeId, code);
		emailChallenge.value = undefined;
		await loadConversations();
	} catch (error: unknown) {
		loginError.value = errorMessage(error);
	} finally {
		loginBusy.value = false;
	}
  }

  async function logout(): Promise<void> {
    if (running.value) await desktopApi.agent.cancel();
    await desktopApi.auth.logout();
    user.value = undefined;
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
    if (running.value) return;
    current.value = await desktopApi.conversations.create();
    clearRunState();
    pendingApproval.value = undefined;
    jd.switchConversation(current.value?.id);
    match.switchConversation(current.value?.id);
    await refreshConversationList();
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
  ): Promise<void> {
    if (!current.value || running.value) return;
    const conversationId = current.value.id;
    const previousMessageIds = new Set(
      current.value.messages.map((message) => message.id),
    );
    const optimistic: ChatMessage = {
      id: `pending-${crypto.randomUUID()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    current.value.messages.push(optimistic);
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
      });
      anchorResponseArtifacts(conversationId, previousMessageIds);
      clearLiveResponse();
      await refreshConversationList();
      await resumeWorkspace.refreshActive();
    } catch (error: unknown) {
      runError.value = errorMessage(error);
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
        decision,
      });
      anchorResponseArtifacts(conversationId, previousMessageIds);
      clearLiveResponse();
      pendingApproval.value = undefined;
      await refreshConversationList();
    } catch (error: unknown) {
      runError.value = errorMessage(error);
    } finally {
      approvalBusy.value = false;
    }
  }

  function handleAgentEvent(
    conversationId: string,
    event: DesktopAgentEvent,
  ): void {
    if (event.type === "approval.required") {
      approvalByConversation.set(conversationId, event.request);
      if (conversationId === current.value?.id) pendingApproval.value = event.request;
      return;
    }
    if (event.type === "approval.resolved") {
      approvalByConversation.delete(conversationId);
      if (
        conversationId === current.value?.id &&
        pendingApproval.value?.id === event.requestId
      ) pendingApproval.value = undefined;
      if (event.decision === "reject") {
        jd.updateStatus(conversationId, event.requestId, "rejected");
      }
      return;
    }
    if (event.type === "jd.proposal.created") {
      jd.add(conversationId, event.data);
      return;
    }
    if (event.type === "jd.saved") {
      jd.updateStatus(
        conversationId,
        event.approvalRequestId,
        "saved",
        event.jdId,
      );
      return;
    }
    if (event.type === "match.report.created") {
      match.add(conversationId, event.data);
      return;
    }
    if (event.type === "approval.completed") {
      const details = event.details as { jdId?: string } | undefined;
      if (details?.jdId) {
        jd.updateStatus(conversationId, event.requestId, "saved", details.jdId);
      }
      return;
    }
    if (conversationId !== current.value?.id) return;
    switch (event.type) {
      case "run.started":
        running.value = true;
        return;
      case "message.delta":
        streamingText.value += event.text;
        return;
      case "tool.started":
        toolRuns.value.push({ callId: event.callId, name: event.name, status: "running" });
        return;
      case "tool.completed": {
        const run = toolRuns.value.find((candidate) => candidate.callId === event.callId);
        if (run) run.status = event.isError ? "error" : "completed";
        return;
      }
      case "resume.draft.updated":
        void resumeWorkspace.openDraft(event.artifactId);
        return;
      case "approval.failed":
      case "run.failed":
        runError.value = event.message;
        if (event.type === "run.failed") running.value = false;
        return;
      case "run.completed":
        running.value = false;
        return;
      default:
        return;
    }
  }

  function clearRunState(): void {
    clearLiveResponse();
    runError.value = undefined;
    pendingApproval.value = undefined;
    approvalBusy.value = false;
  }

  function clearLiveResponse(): void {
    streamingText.value = "";
    toolRuns.value = [];
  }

  function anchorResponseArtifacts(
    conversationId: string,
    previousMessageIds: ReadonlySet<string>,
  ): void {
    if (!current.value || current.value.id !== conversationId) return;
    const messageId = latestNewAssistantMessageId(
      current.value.messages,
      previousMessageIds,
    );
    jd.anchorPending(conversationId, messageId);
    match.anchorPending(conversationId, messageId);
  }

  return {
    booting,
    user,
    loginBusy,
    loginError,
	emailChallenge,
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
    login,
	requestEmailCode,
	verifyEmailCode,
    logout,
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

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/u, "")
    .replace(/^Error:\s*/u, "");
}

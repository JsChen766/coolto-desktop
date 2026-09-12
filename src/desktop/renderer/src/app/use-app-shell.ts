import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { JdChatReference, ResumeChatReference } from "@desktop/types";
import { toMessageAttachment } from "../attachments/attachment-formatters";
import { useConversationAttachment } from "../attachments/use-conversation-attachment";
import { useBrowserState } from "../browser/use-browser-state";
import { useFillProgress } from "../browser/use-fill-progress";
import { useChatSession } from "../chat/use-chat-session";
import { desktopApi } from "../lib/desktop-api";
import { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";
import { useAppUpdates } from "../updates/use-app-updates";
import { useBrowserAgentTaskNavigation } from "./use-browser-agent-task-navigation";
import { useResumeLibraryPreview } from "./use-resume-library-preview";
import { useResumeConversationContext } from
  "./use-resume-conversation-context";
import { useResumeInstructionActions } from "./use-resume-instruction-actions";
import { useWindowCloseSave } from "./use-window-close-save";
import { useWorkspaceFlows } from "./use-workspace-flows";
export type AppView = "chat" | "agent_tasks" | "experiences" | "library" | "tracker" | "material";
export function useAppShell() {
  const sidebarOpen = ref(true);
  const artifactOpen = ref(false);
  const activeArtifactType = ref<"resume" | "jd" | "match">("resume");
  const activeView = ref<AppView>("chat");
  const resumeWorkspace = useResumeWorkspace();
  const session = useChatSession(resumeWorkspace);
  const updates = useAppUpdates(() => session.user.value);
  const conversationAttachment = useConversationAttachment(
    () => session.current.value?.id,
  );
  const browser = useBrowserState();
  const fillProgress = useFillProgress();
  const { page: browserPageHandoff, task: agentTaskFocusRequest, focusTask } =
    useBrowserAgentTaskNavigation();
  const scroller = ref<HTMLElement>();
  const dark = ref(localStorage.getItem("coolto-theme") === "dark");
  const narrowScreen = window.matchMedia("(max-width: 820px)");
  useWindowCloseSave(resumeWorkspace);
  onMounted(() => {
    applyTheme();
    fillProgress.mount();
    if (narrowScreen.matches) sidebarOpen.value = false;
    narrowScreen.addEventListener("change", handleNarrowScreen);
  });
  onBeforeUnmount(() => {
    fillProgress.unmount();
    narrowScreen.removeEventListener("change", handleNarrowScreen);
  });
  watch(
    [
      () => session.current.value?.messages.length,
      session.streamingText,
      session.pendingApproval,
      session.jdArtifacts,
      session.matchReports,
      fillProgress.records,
      fillProgress.lastOutcome,
      fillProgress.captcha,
    ],
    () => void nextTick(scrollToBottom),
  );
  const resumePreview = useResumeLibraryPreview({
    activeView,
    activeArtifactType, artifactOpen,
    clearLocalError: () => { resumeWorkspace.error.value = undefined; },
    closeNarrowSidebar,
    draftIds: () => resumeWorkspace.drafts.value.map((draft) => draft.artifactId),
    openLocalDraft: (artifactId) =>
      resumeConversations.openResumeDraft(artifactId, false),
    sendInstruction: (text, reference) => send(text, reference),
  });
  const resumeConversations = useResumeConversationContext({
    session,
    workspace: resumeWorkspace,
    preview: resumePreview,
    activeView,
    activeArtifactType,
    artifactOpen,
    closeNarrowSidebar,
    conversationsApi: desktopApi.conversations,
  });
  watch(
    () => resumeWorkspace.activeDraft.value,
    (draft) => {
      if (!draft) return;
      resumePreview.adoptCreatedLocalDraft(draft);
      activeView.value = "chat";
      activeArtifactType.value = "resume";
      artifactOpen.value = true;
      closeNarrowSidebar();
    },
  );
  async function send(
    text: string,
    resumeReference?: ResumeChatReference,
    jdReference?: JdChatReference,
  ): Promise<void> {
    const attachment = conversationAttachment.attachment.value;
    await session.send(
      text, resumeReference, jdReference,
      attachment ? [toMessageAttachment(attachment)] : undefined,
    );
    await resumeConversations.restoreCurrentResumeContext();
    await conversationAttachment.remove().catch(() => undefined);
  }
  function openPrimaryView(view: "agent_tasks" | "experiences" | "library" | "material"): void {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    activeView.value = view;
  }
  function openAgentTask(taskId: string): void {
    focusTask(taskId);
    openPrimaryView("agent_tasks");
  }
  function openTracker(): void {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    jobFlow.trackerContext.value = {};
    activeView.value = "tracker";
  }
  function openJdPanel(proposalId: string): void {
    resumePreview.resetResumePreview();
    session.openJdDetail(proposalId);
    activeArtifactType.value = "jd";
    artifactOpen.value = true;
  }
  function openMatchPanel(reportId: string): void {
    resumePreview.resetResumePreview();
    session.openMatchDetail(reportId);
    activeArtifactType.value = "match";
    artifactOpen.value = true;
  }
  async function toggleArtifact(): Promise<void> {
    artifactOpen.value = !artifactOpen.value;
    if (!artifactOpen.value) {
      resumePreview.resetResumePreview();
      return;
    }
    if (activeArtifactType.value !== "resume") return;
    if (await resumeConversations.restoreCurrentResumeContext()) return;
    const first = resumeWorkspace.drafts.value[0];
    if (!resumeWorkspace.activeDraft.value && first) {
      await resumeConversations.openResumeDraft(first.artifactId);
    }
  }
  async function toggleBrowser(): Promise<void> {
    if (browser.state.isOpen) await browser.close();
    else await browser.open({ theme: dark.value ? "dark" : "light" });
  }
  function draftCloudState(artifactId: string) {
    return resumeWorkspace.drafts.value.find(
      (draft) => draft.artifactId === artifactId,
    )?.cloudState;
  }
  function toggleTheme(): void {
    dark.value = !dark.value;
    localStorage.setItem("coolto-theme", dark.value ? "dark" : "light");
    applyTheme();
  }

  function showSidebar(): void {
    sidebarOpen.value = true;
  }

  function closeNarrowSidebar(): void {
    if (narrowScreen.matches) sidebarOpen.value = false;
  }

  function handleNarrowScreen(event: MediaQueryListEvent): void {
    if (event.matches) sidebarOpen.value = false;
  }

  function applyTheme(): void {
    document.documentElement.classList.toggle("dark", dark.value);
  }

  function scrollToBottom(): void {
    scroller.value?.scrollTo({
      top: scroller.value.scrollHeight,
      behavior: "smooth",
    });
  }

  const { jobFlow, deliveryResume, experienceImport } = useWorkspaceFlows({
    activeView, closeNarrowSidebar, createChat: resumeConversations.createChat,
    selectConversation: resumeConversations.selectChat,
    send: (text, reference) => send(text, undefined, reference),
    setError: (message) => { session.runError.value = message; },
  });
  function openTrackerApplication(applicationId: string, interviewId: string): void {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    jobFlow.trackerContext.value = { applicationId, interviewId };
    activeView.value = "tracker";
  }
  const resumeInstructions = useResumeInstructionActions({
    workspace: resumeWorkspace,
  });

  return {
    ...session,
    activeArtifactType,
    agentTaskFocusRequest,
    activeView,
    artifactOpen,
    browser,
    browserPageHandoff,
    conversationAttachment,
    dark,
    desktopApi,
    draftCloudState,
    exportResume: resumeInstructions.exportPdf,
    fillProgress,
    ...resumePreview,
    ...resumeConversations,
    openJdPanel,
    openAgentTask,
    openPrimaryView,
    openMatchPanel,
    openTracker,
    openTrackerApplication,
    ...jobFlow,
    ...deliveryResume,
    clearExperienceImportFocus: experienceImport.clear,
    experienceImportFocus: experienceImport.focus,
    openExperienceImportResult: experienceImport.open,
    returnToImportConversation: experienceImport.returnToConversation,
    resumeWorkspace,
    saveResumeToCloud: resumeInstructions.saveToCloud,
    scroller,
    send,
    showSidebar,
    sidebarOpen,
    toggleArtifact,
    toggleBrowser,
    toggleTheme,
    updateState: updates.updateState,
    updateChecking: updates.updateChecking,
    updateUpToDate: updates.updateUpToDate,
    checkUpdate: updates.checkUpdate,
    installUpdate: updates.installUpdate,
  };
  }
export type AppShell = ReturnType<typeof useAppShell>;

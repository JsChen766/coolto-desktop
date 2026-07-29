import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { ResumeChatReference } from "@desktop/types";
import { useConversationAttachment } from "../attachments/use-conversation-attachment";
import { useBrowserState } from "../browser/use-browser-state";
import { useFillProgress } from "../browser/use-fill-progress";
import { useChatSession } from "../chat/use-chat-session";
import { desktopApi } from "../lib/desktop-api";
import { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";
import { useJobFlowNavigation } from "./use-job-flow-navigation";
import { useExperienceImportNavigation } from "./use-experience-import-navigation";
import { useResumeLibraryPreview } from "./use-resume-library-preview";
import { useResumeInstructionActions } from "./use-resume-instruction-actions";

export type AppView = "chat" | "experiences" | "library" | "tracker";

export function useAppShell() {
  const sidebarOpen = ref(true);
  const artifactOpen = ref(false);
  const activeArtifactType = ref<"resume" | "jd" | "match">("resume");
  const activeView = ref<AppView>("chat");
  const resumeWorkspace = useResumeWorkspace();
  const session = useChatSession(resumeWorkspace);
  const conversationAttachment = useConversationAttachment(
    () => session.current.value?.id,
  );
  const browser = useBrowserState();
  const fillProgress = useFillProgress();
  const scroller = ref<HTMLElement>();
  const dark = ref(localStorage.getItem("coolto-theme") === "dark");
  const narrowScreen = window.matchMedia("(max-width: 820px)");

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
    activeArtifactType,
    artifactOpen,
    closeNarrowSidebar,
    draftIds: () => resumeWorkspace.drafts.value.map((draft) => draft.artifactId),
    openLocalDraft: resumeWorkspace.openDraft,
    sendInstruction: (text, reference) => send(text, reference),
  });
  watch(
    () => resumeWorkspace.activeDraft.value,
    (draft) => {
      if (draft) resumePreview.adoptCreatedLocalDraft(draft);
    },
  );

  async function send(
    text: string,
    resumeReference?: ResumeChatReference,
  ): Promise<void> {
    await session.send(text, resumeReference);
  }

  async function openResumeDraft(artifactId: string): Promise<void> {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    activeView.value = "chat";
    activeArtifactType.value = "resume";
    artifactOpen.value = true;
    await resumeWorkspace.openDraft(artifactId);
  }

  function openPrimaryView(view: "experiences" | "library"): void {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    activeView.value = view;
  }

  function openTracker(): void {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    jobFlow.trackerContext.value = {};
    activeView.value = "tracker";
  }

  async function createChat(): Promise<void> {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    activeView.value = "chat";
    await session.createConversation();
  }

  async function selectChat(conversationId: string): Promise<void> {
    resumePreview.resetResumePreview();
    closeNarrowSidebar();
    activeView.value = "chat";
    await session.selectConversation(conversationId);
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
    const first = resumeWorkspace.drafts.value[0];
    if (!resumeWorkspace.activeDraft.value && first) {
      await resumeWorkspace.openDraft(first.artifactId);
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

  const jobFlow = useJobFlowNavigation({
    activeView,
    closeNarrowSidebar,
    createChat,
    send: (text) => send(text),
  });
  const experienceImport = useExperienceImportNavigation({
    activeView,
    closeNarrowSidebar,
    selectConversation: session.selectConversation,
  });
  const resumeInstructions = useResumeInstructionActions({
    workspace: resumeWorkspace,
    send,
  });

  return {
    ...session,
    activeArtifactType,
    activeView,
    artifactOpen,
    browser,
    conversationAttachment,
    dark,
    desktopApi,
    draftCloudState,
    exportResume: resumeInstructions.exportPdf,
    fillProgress,
    ...resumePreview,
    openJdPanel,
    openPrimaryView,
    openMatchPanel,
    openResumeDraft,
    openTracker,
    ...jobFlow,
    clearExperienceImportFocus: experienceImport.clear,
    createChat,
    experienceImportFocus: experienceImport.focus,
    openExperienceImportResult: experienceImport.open,
    returnToImportConversation: experienceImport.returnToConversation,
    resumeWorkspace,
    saveResumeToCloud: resumeInstructions.saveToCloud,
    scroller,
    selectChat,
    send,
    showSidebar,
    sidebarOpen,
    toggleArtifact,
    toggleBrowser,
    toggleTheme,
  };
}

export type AppShell = ReturnType<typeof useAppShell>;

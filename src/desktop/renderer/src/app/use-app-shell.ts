import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { ResumeChatReference, ResumeLibraryEntry } from "@desktop/types";
import { useConversationAttachment } from "../attachments/use-conversation-attachment";
import { useBrowserState } from "../browser/use-browser-state";
import { useFillProgress } from "../browser/use-fill-progress";
import { useChatSession } from "../chat/use-chat-session";
import { desktopApi } from "../lib/desktop-api";
import { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";

export type AppView = "chat" | "library" | "tracker";

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

  onMounted(() => {
    applyTheme();
    fillProgress.mount();
  });
  onBeforeUnmount(() => fillProgress.unmount());

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

  async function send(
    text: string,
    resumeReference?: ResumeChatReference,
  ): Promise<void> {
    await session.send(text, resumeReference);
  }

  async function openResumeDraft(artifactId: string): Promise<void> {
    activeView.value = "chat";
    activeArtifactType.value = "resume";
    artifactOpen.value = true;
    await resumeWorkspace.openDraft(artifactId);
  }

  async function openFromLibrary(entry: ResumeLibraryEntry): Promise<void> {
    activeView.value = "chat";
    if (entry.local) await openResumeDraft(entry.local.artifactId);
    // TODO: cloud_only — 拉取云端内容创建本地草稿后再打开
  }

  function openLibrary(): void {
    activeView.value = "library";
  }

  function openTracker(): void {
    activeView.value = "tracker";
  }

  async function createChat(): Promise<void> {
    activeView.value = "chat";
    await session.createConversation();
  }

  async function selectChat(conversationId: string): Promise<void> {
    activeView.value = "chat";
    await session.selectConversation(conversationId);
  }

  function openJdPanel(proposalId: string): void {
    session.openJdDetail(proposalId);
    activeArtifactType.value = "jd";
    artifactOpen.value = true;
  }

  function openMatchPanel(reportId: string): void {
    session.openMatchDetail(reportId);
    activeArtifactType.value = "match";
    artifactOpen.value = true;
  }

  async function toggleArtifact(): Promise<void> {
    artifactOpen.value = !artifactOpen.value;
    if (!artifactOpen.value || activeArtifactType.value !== "resume") return;
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

  function activeResumeReference(): ResumeChatReference | undefined {
    const draft = resumeWorkspace.activeDraft.value;
    return draft
      ? {
          artifactId: draft.artifactId,
          targetType: "resume",
          targetId: draft.artifactId,
          label: draft.title,
        }
      : undefined;
  }

  function sendResumeInstruction(text: string): void {
    const reference = activeResumeReference();
    if (reference) void send(text, reference);
  }

  function saveResumeToCloud(): void {
    sendResumeInstruction("请将右侧当前本地简历保存到云端。");
  }

  function exportResume(): void {
    sendResumeInstruction("请将右侧当前简历导出为 PDF 到本地文件。");
  }

  function toggleTheme(): void {
    dark.value = !dark.value;
    localStorage.setItem("coolto-theme", dark.value ? "dark" : "light");
    applyTheme();
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
    exportResume,
    fillProgress,
    openFromLibrary,
    openJdPanel,
    openLibrary,
    openMatchPanel,
    openResumeDraft,
    openTracker,
    createChat,
    resumeWorkspace,
    saveResumeToCloud,
    scroller,
    selectChat,
    send,
    sidebarOpen,
    toggleArtifact,
    toggleBrowser,
    toggleTheme,
  };
}

export type AppShell = ReturnType<typeof useAppShell>;

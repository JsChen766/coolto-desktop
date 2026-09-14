import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

import type { AppShell } from "./use-app-shell";

type MainWorkspaceHandle = {
  confirmExperienceLeave?: () => Promise<boolean> | boolean;
};

export function useAppLifecycle(
  shell: AppShell,
  mainWorkspace: Ref<MainWorkspaceHandle | undefined>,
  firstVisit: Ref<boolean>,
) {
  const profileDialogOpen = ref(false);
  const profileTrigger = ref<HTMLElement>();
  const preferenceDialogOpen = ref(false);
  const preferenceTrigger = ref<HTMLElement>();
  const settingsDialogOpen = ref(false);
  function guardNavigation(action: () => void | Promise<void>): void {
    void (async () => {
      if (shell.running.value) return;
      if (
        shell.activeView.value === "experiences" &&
        (await mainWorkspace.value?.confirmExperienceLeave?.()) === false
      ) return;
      await action();
    })();
  }

  function openTaskFromSettings(taskId: string): void {
    settingsDialogOpen.value = false;
    shell.openAgentTask(taskId);
  }

  function requestPrimaryView(view: "agent_tasks" | "experiences" | "library"): void {
    if (shell.activeView.value !== view) guardNavigation(() => shell.openPrimaryView(view));
  }

  async function openAgentTaskFromBrowser(): Promise<void> {
    if (
      shell.activeView.value === "experiences" &&
      (await mainWorkspace.value?.confirmExperienceLeave?.()) === false
    ) return;
    shell.openPrimaryView("agent_tasks");
  }

  function openProfile(trigger: HTMLElement): void {
    profileTrigger.value = trigger;
    profileDialogOpen.value = true;
  }

  function openProfileFromSettings(): void {
    settingsDialogOpen.value = false;
    const trigger = document.querySelector(".user-menu-trigger") as HTMLElement | null;
    openProfile(trigger ?? document.body);
  }

  function closeProfile(): void {
    profileDialogOpen.value = false;
    void nextTick(() => profileTrigger.value?.focus());
  }

  function openPreferences(trigger?: HTMLElement): void {
    preferenceTrigger.value = trigger ?? document.body;
    preferenceDialogOpen.value = true;
  }

  function openPreferencesFromSettings(): void {
    settingsDialogOpen.value = false;
    openPreferences(document.querySelector(".user-menu-trigger") as HTMLElement | undefined);
  }

  function closePreferences(): void {
    preferenceDialogOpen.value = false;
    void nextTick(() => {
      if (preferenceTrigger.value?.isConnected) preferenceTrigger.value.focus();
    });
  }

  watch(shell.user, (next, previous) => {
    if (previous && !next) firstVisit.value = false;
  });
  watch(shell.agentTaskFocusRequest, (request) => {
    if (request) void openAgentTaskFromBrowser();
  });
  watch([shell.browserPageHandoff, shell.current, shell.user], ([request, conversation, account]) => {
    if (!request || !conversation || !account || shell.activeView.value === "chat") return;
    guardNavigation(() => shell.selectChat(conversation.id));
  });

  let unsubscribeCalendar: () => void = () => undefined;
  onMounted(() => {
    unsubscribeCalendar = shell.desktopApi.calendar.onOpenInterview((target) => {
      guardNavigation(() => shell.openTrackerApplication(target.applicationId, target.interviewId));
    });
  });
  onBeforeUnmount(() => unsubscribeCalendar());

  return {
    closeProfile,
    closePreferences,
    guardNavigation,
    openProfile,
    openProfileFromSettings,
    openPreferences,
    openPreferencesFromSettings,
    openTaskFromSettings,
    preferenceDialogOpen,
    profileDialogOpen,
    requestPrimaryView,
    settingsDialogOpen,
  };
}

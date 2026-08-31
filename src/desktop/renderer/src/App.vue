<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  ConversationDialog,
  LoginScreen,
  Sidebar,
} from "./app/app-components";
import AppMainWorkspace from "./app/AppMainWorkspace.vue";
import { useAppShell } from "./app/use-app-shell";
import ResumePreviewChoiceDialog from "./components/ResumePreviewChoiceDialog.vue";
import CloudResumeCopyDialog from "./components/CloudResumeCopyDialog.vue";
import PrivacyConsentDialog from "./components/PrivacyConsentDialog.vue";
import ProfileDialog from "./components/ProfileDialog.vue";
import SettingsDialog from "./components/SettingsDialog.vue";
import CreditsHost from "./components/CreditsHost.vue";
import WindowTitleBar from "./components/WindowTitleBar.vue";
import ForcedUpdateDialog from "./components/ForcedUpdateDialog.vue";

const shell = useAppShell();
const mainWorkspace = ref<InstanceType<typeof AppMainWorkspace>>();
const profileDialogOpen = ref(false);
const profileTrigger = ref<HTMLElement>();
const settingsDialogOpen = ref(false);
const privacyConsent = ref(localStorage.getItem("coolto-privacy-consent") === "1");
const firstVisit = ref(localStorage.getItem("coolto-visited") === null);
const {
  activeView,
  agentTaskFocusRequest,
  booting,
  browserPageHandoff,
  confirmDialog,
  conversations,
  createChat,
  current,
  dark,
  desktopApi,
  dialog,
  emailChallenge,
  loginBusy,
  loginError,
  logout,
  chooseResumePreview,
  cloudCopyConfirmation,
  confirmCloudResumeCopy,
  openDialog,
  openPrimaryView,
  openResumeDraft,
  openTracker,
  openTrackerApplication,
  requestEmailCode,
  resumePreviewChoice,
  resumeOperationContext,
  resumeWorkspace,
  running,
  selectChat,
  sidebarOpen,
  toggleTheme,
  updateChecking,
  updateState,
  updateUpToDate,
  checkUpdate,
  installUpdate,
  user,
  verifyEmailCode,
} = shell;

function guardNavigation(action: () => void | Promise<void>): void {
  void (async () => {
    if (running.value) return;
    if (activeView.value === "experiences" &&
        (await mainWorkspace.value?.confirmExperienceLeave()) === false) return;
    await action();
  })();
}
function requestPrimaryView(view: "agent_tasks" | "experiences" | "library"): void {
  if (activeView.value !== view) guardNavigation(() => openPrimaryView(view));
}
async function openAgentTaskFromBrowser(): Promise<void> {
  if (activeView.value === "experiences" &&
      (await mainWorkspace.value?.confirmExperienceLeave()) === false) return;
  openPrimaryView("agent_tasks");
}
function openProfile(trigger: HTMLElement): void {
  profileTrigger.value = trigger;
  profileDialogOpen.value = true;
}

function openProfileFromSettings(): void {
  const trigger = document.querySelector(".user-menu-trigger") as HTMLElement | null;
  openProfile(trigger ?? document.body);
}

function closeProfile(): void {
  profileDialogOpen.value = false;
  void nextTick(() => profileTrigger.value?.focus());
}

function acceptPrivacy(): void {
  localStorage.setItem("coolto-privacy-consent", "1");
  privacyConsent.value = true;
}

watch(user, (next, previous) => { if (previous && !next) firstVisit.value = false; });
watch(agentTaskFocusRequest, (request) => {
  if (request) void openAgentTaskFromBrowser();
});
watch([browserPageHandoff, current, user], ([request, conversation, account]) => {
  if (!request || !conversation || !account || activeView.value === "chat") return;
  guardNavigation(() => selectChat(conversation.id));
});
const creditsHost = ref<InstanceType<typeof CreditsHost>>();
let unsubscribeCalendar: () => void = () => undefined;
onMounted(() => {
  unsubscribeCalendar = desktopApi.calendar.onOpenInterview((target) => {
    guardNavigation(() => openTrackerApplication(target.applicationId, target.interviewId));
  });
});
onBeforeUnmount(() => unsubscribeCalendar());
</script>

<template>
  <div class="app-frame" :class="[`platform-${desktopApi.platform}`]">
    <WindowTitleBar v-if="desktopApi.platform !== 'darwin'" />

    <ForcedUpdateDialog
      :state="updateState"
      @install="installUpdate"
      @retry="checkUpdate"
    />

    <div v-if="booting" class="boot-screen">
      <div class="boot-pulse" />
    </div>

    <PrivacyConsentDialog
      v-else-if="!user && !privacyConsent"
      @agree="acceptPrivacy"
    />

    <LoginScreen
      v-else-if="!user"
      :busy="loginBusy"
      :error="loginError"
      :challenge="emailChallenge"
      :first-visit="firstVisit"
      @request-code="requestEmailCode"
      @verify-code="verifyEmailCode"
    />

    <div
      v-else
      class="app-shell"
      :class="[`platform-${desktopApi.platform}`, { 'sidebar-hidden': !sidebarOpen }]"
    >
    <Sidebar
      v-if="sidebarOpen"
      :conversations="conversations"
      :current-id="current?.id"
      :user="user"
      :dark="dark"
      :resume-drafts="resumeWorkspace.drafts.value"
      :current-draft-id="resumeWorkspace.activeDraft.value?.artifactId"
      :active-view="activeView"
      :generating="running"
      :update-state="updateState"
      :update-checking="updateChecking"
      :update-up-to-date="updateUpToDate"
      :credits="creditsHost?.totalCredits"
      :unlimited="creditsHost?.unlimited === true"
      @create="guardNavigation(createChat)"
      @select="guardNavigation(() => selectChat($event))"
      @select-draft="guardNavigation(() => openResumeDraft($event))"
      @open-experiences="requestPrimaryView('experiences')"
      @open-agent-tasks="requestPrimaryView('agent_tasks')"
      @open-library="requestPrimaryView('library')"
      @open-tracker="guardNavigation(openTracker)"
      @rename="openDialog('rename', $event)"
      @delete="openDialog('delete', $event)"
      @toggle-theme="toggleTheme"
      @open-profile="openProfile"
      @open-settings="settingsDialogOpen = true"
      @open-credits="creditsHost?.open()"
      @check-update="checkUpdate"
      @install-update="installUpdate"
      @logout="guardNavigation(logout)"
    />
    <button
      v-if="sidebarOpen"
      class="sidebar-scrim"
      type="button"
      :aria-label="$t('关闭侧栏')"
      @click="sidebarOpen = false"
    />

    <AppMainWorkspace ref="mainWorkspace" :shell="shell" />

    <ConversationDialog
      v-if="dialog"
      :mode="dialog.mode"
      :title="dialog.conversation.title"
      @close="dialog = undefined"
      @confirm="confirmDialog"
    />
    <ResumePreviewChoiceDialog
      v-if="resumePreviewChoice"
      :entry="resumePreviewChoice"
      @close="resumePreviewChoice = undefined"
      @local="chooseResumePreview('local')"
      @cloud="chooseResumePreview('cloud')"
    />
    <CloudResumeCopyDialog
      v-if="cloudCopyConfirmation && resumeOperationContext"
      :title="resumeOperationContext.label"
      @close="cloudCopyConfirmation = false"
      @confirm="confirmCloudResumeCopy"
    />
    <ProfileDialog v-if="profileDialogOpen" :api="desktopApi" @close="closeProfile" />
    <SettingsDialog v-if="settingsDialogOpen" :api="desktopApi" @close="settingsDialogOpen = false" @open-profile="openProfileFromSettings" />
    <CreditsHost ref="creditsHost" :api="desktopApi" :user="user" />
    </div>
  </div>
</template>

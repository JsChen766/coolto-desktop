<script setup lang="ts">
import { ref } from "vue";

import {
  ApplicationTrackerView,
  ExperienceLibraryView,
  JobRepositoryView,
} from "./app-components";
import AgentTasksView from "../agent-tasks/AgentTasksView.vue";
import AppChatWorkspace from "./AppChatWorkspace.vue";
import type { AppShell } from "./use-app-shell";
import type { JobRepositoryResume } from "@desktop/types";
import ResumeJobLoopDialog from "../agent-tasks/ResumeJobLoopDialog.vue";

const props = defineProps<{ shell: AppShell }>();
const experienceLibrary = ref<InstanceType<typeof ExperienceLibraryView>>();
const loopResume = ref<JobRepositoryResume>();
const {
  activeView, agentTaskFocusRequest, clearExperienceImportFocus, closeTracker, current, desktopApi,
  experienceImportFocus, jobRepositoryNavigation, openRepositoryTracker,
  openTrackerAsset, requestResumePreview, returnToImportConversation,
  openAgentTask, selectChat, showSidebar, startDeliveryResumeFile, startJdAction, trackerContext,
  updateRepositoryNavigation,
} = props.shell;

function recordFromRepository(
  initial: Parameters<typeof openRepositoryTracker>[1],
  asset: Parameters<typeof openRepositoryTracker>[0],
): void {
  openRepositoryTracker(asset, initial);
}

function confirmExperienceLeave(): Promise<boolean> | boolean {
  return experienceLibrary.value?.confirmLeave() ?? true;
}

function loopStarted(taskId: string): void {
  loopResume.value = undefined;
  openAgentTask(taskId);
}

defineExpose({ confirmExperienceLeave });
</script>

<template>
  <main class="main-workspace">
    <AgentTasksView
      v-if="activeView === 'agent_tasks'"
      :api="desktopApi"
      :focus-request="agentTaskFocusRequest"
      @toggle-sidebar="showSidebar"
      @open-conversation="selectChat"
    />
    <ApplicationTrackerView
      v-else-if="activeView === 'tracker'"
      :context="trackerContext"
      :conversation-id="current?.id ?? ''"
      @close="closeTracker"
      @open-asset="openTrackerAsset"
      @open-agent-task="openAgentTask"
    />
    <ExperienceLibraryView
      v-else-if="activeView === 'experiences'"
      ref="experienceLibrary"
      :import-focus="experienceImportFocus"
      @return-import="returnToImportConversation"
      @clear-import-focus="clearExperienceImportFocus"
      @toggle-sidebar="showSidebar"
    />
    <JobRepositoryView
      v-else-if="activeView === 'library'"
      :navigation="jobRepositoryNavigation"
      @open="requestResumePreview"
      @toggle-sidebar="showSidebar"
      @navigate="updateRepositoryNavigation"
      @agent="startJdAction"
      @record="recordFromRepository"
      @tracker="openRepositoryTracker"
      @applications="openRepositoryTracker()"
      @delivery="startDeliveryResumeFile"
      @resume-loop="loopResume = $event"
    />
    <AppChatWorkspace v-else :shell="shell" />
    <ResumeJobLoopDialog v-if="loopResume" :api="desktopApi"
      :conversation-id="current?.id ?? ''" :resume="loopResume"
      @close="loopResume = undefined" @started="loopStarted" />
  </main>
</template>

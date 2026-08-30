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

const props = defineProps<{ shell: AppShell }>();
const experienceLibrary = ref<InstanceType<typeof ExperienceLibraryView>>();
const {
  activeView, clearExperienceImportFocus, closeTracker, desktopApi,
  experienceImportFocus, jobRepositoryNavigation, openRepositoryTracker,
  openTrackerAsset, requestResumePreview, returnToImportConversation,
  selectChat, showSidebar, startDeliveryResumeFile, startJdAction, trackerContext,
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

defineExpose({ confirmExperienceLeave });
</script>

<template>
  <main class="main-workspace">
    <AgentTasksView
      v-if="activeView === 'agent_tasks'"
      :api="desktopApi"
      @toggle-sidebar="showSidebar"
      @open-conversation="selectChat"
    />
    <ApplicationTrackerView
      v-else-if="activeView === 'tracker'"
      :context="trackerContext"
      @close="closeTracker"
      @open-asset="openTrackerAsset"
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
    />
    <AppChatWorkspace v-else :shell="shell" />
  </main>
</template>

<script setup lang="ts">
import { nextTick, ref } from "vue";

import ProfileDialog from "../components/ProfileDialog.vue";
import PreferenceDialog from "../components/PreferenceDialog.vue";
import SettingsDialog from "../components/SettingsDialog.vue";
import { createPhase2QaApi } from "./mock-api";

const api = createPhase2QaApi();
const settingsOpen = ref(true);
const profileOpen = ref(false);
const preferenceOpen = ref(false);
const conversationId = "conversation-phase2-qa";

function closeProfile(): void {
  profileOpen.value = false;
  void nextTick(() => {
    if (settingsOpen.value) {
      document.querySelector<HTMLElement>("[data-settings-initial-focus]")?.focus();
    }
  });
}

function closePreferences(): void {
  preferenceOpen.value = false;
  void nextTick(() => {
    if (settingsOpen.value) {
      document.querySelector<HTMLElement>("[data-settings-initial-focus]")?.focus();
    }
  });
}
</script>

<template>
  <SettingsDialog
    v-if="settingsOpen"
    :api="api"
    :conversation-id="conversationId"
    @close="settingsOpen = false"
    @open-profile="profileOpen = true"
    @open-preferences="preferenceOpen = true"
  />
  <ProfileDialog v-if="profileOpen" :api="api" @close="closeProfile" />
  <PreferenceDialog v-if="preferenceOpen" :api="api" @close="closePreferences" />
</template>

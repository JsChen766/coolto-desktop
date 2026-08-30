<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from "vue";

import type { BrowserAgentInspectorViewState } from "@desktop/types";
import BrowserAgentInspector from "../browser-shell/BrowserAgentInspector.vue";
import { setLocale } from "../i18n/locale";

const api = window.browserAgentInspector;
const state = shallowRef<BrowserAgentInspectorViewState>();
const inspector = useTemplateRef<InstanceType<typeof BrowserAgentInspector>>("inspector");
const unsubscribeState = api.onStateChanged((next) => {
  state.value = next;
  setLocale(next.locale);
  document.documentElement.classList.toggle("dark", next.theme === "dark");
});
const unsubscribeFocus = api.onFocus(async () => {
  await nextTick();
  await inspector.value?.focusInitial();
});

onMounted(() => api.ready(
  window.matchMedia("(prefers-reduced-motion: reduce)").matches,
));
onBeforeUnmount(() => {
  unsubscribeState();
  unsubscribeFocus();
});
</script>

<template>
  <BrowserAgentInspector
    v-if="state"
    ref="inspector"
    :state="state.agent"
    :mode="state.mode"
    :presentation="state.presentation"
    @close="api.close()"
    @command="api.command($event)"
    @open-task="api.openTask()"
  />
</template>

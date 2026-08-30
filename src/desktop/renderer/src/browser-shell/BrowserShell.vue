<script setup lang="ts">
import {
  computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch,
} from "vue";

import type {
  BrowserLocale,
  BrowserShellState,
  BrowserTabState,
} from "@desktop/types";
import BrowserAddressBar from "./BrowserAddressBar.vue";
import BrowserTabStrip from "./BrowserTabStrip.vue";
import BrowserWindowControls from "./BrowserWindowControls.vue";
import BrowserAgentBar from "./BrowserAgentBar.vue";
import BrowserNavigationProgress from "./BrowserNavigationProgress.vue";
import { localeCode } from "../i18n/locale";

const shell = window.browserShell;

const state = shallowRef<BrowserShellState>({
  tabs: [],
  activeTabId: null,
  theme: "light",
  platform: shell.platform,
  isMaximized: false,
  agentControl: null,
  permissionNotice: null,
});
const chromeEl = useTemplateRef<HTMLElement>("chromeEl");

const activeTab = computed<BrowserTabState | undefined>(() =>
  state.value.tabs.find((tab) => tab.id === state.value.activeTabId),
);

const isMac = computed(() => state.value.platform === "darwin");

const unsubscribe = shell.onStateChanged((next) => {
  state.value = next;
  document.documentElement.classList.toggle("dark", next.theme === "dark");
});

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  shell.ready(localeCode() as BrowserLocale);
  shell.requestState();
  if (chromeEl.value) {
    resizeObserver = new ResizeObserver(() => reportHeight());
    resizeObserver.observe(chromeEl.value);
    reportHeight();
  }
});

onBeforeUnmount(() => {
  unsubscribe();
  resizeObserver?.disconnect();
});

watch(() => state.value.tabs.length, () => void reportHeight());

function reportHeight(): void {
  if (chromeEl.value) shell.reportChromeHeight(chromeEl.value.offsetHeight);
}

</script>

<template>
  <div
    ref="chromeEl"
    class="browser-chrome window-drag"
    :class="[`platform-${state.platform}`]"
  >
    <div class="chrome-top" :class="{ 'mac-inset': isMac }">
      <BrowserTabStrip
        :tabs="state.tabs"
        :active-tab-id="state.activeTabId"
        @select="shell.selectTab"
        @close="shell.closeTab"
        @create="shell.newTab()"
      />
      <BrowserWindowControls
        v-if="!isMac"
        :is-maximized="state.isMaximized"
        @minimize="shell.minimizeWindow()"
        @toggle-maximize="shell.toggleMaximizeWindow()"
        @close="shell.closeWindow()"
      />
    </div>

    <BrowserAddressBar :tab="activeTab" :permission-notice="state.permissionNotice"
      @back="shell.goBack()"
      @forward="shell.goForward()" @navigate="shell.navigate($event)"
      @reload="shell.reload()" @stop="shell.stopLoading()"
      @dismiss-permission-notice="shell.dismissPermissionNotice()" />
    <BrowserNavigationProgress v-if="activeTab" :phase="activeTab.loadPhase"
      :is-loading="activeTab.isLoading" />
    <BrowserAgentBar
      v-if="state.agentControl"
      :state="state.agentControl"
      @pause="shell.pauseAgent()"
      @resume="shell.resumeAgent()"
      @takeover="shell.takeoverAgent()"
      @stop="shell.stopAgent()"
    />
  </div>
</template>

<style scoped src="./browser-shell-view.css"></style>

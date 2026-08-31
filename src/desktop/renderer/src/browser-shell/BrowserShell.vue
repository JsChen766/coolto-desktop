<script setup lang="ts">
import {
  computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch,
} from "vue";

import type {
  BrowserLocale,
  BrowserShellState,
  BrowserTabState,
} from "@desktop/types";
import BrowserAddressBar from "./BrowserAddressBar.vue";
import BrowserAgentCapsule from "./BrowserAgentCapsule.vue";
import BrowserDownloadTrigger from "./BrowserDownloadTrigger.vue";
import BrowserFindBar from "./BrowserFindBar.vue";
import BrowserPageHandoffButton from "./BrowserPageHandoffButton.vue";
import BrowserTabStrip from "./BrowserTabStrip.vue";
import BrowserWindowControls from "./BrowserWindowControls.vue";
import BrowserNavigationProgress from "./BrowserNavigationProgress.vue";
import { localeCode, setLocale } from "../i18n/locale";

const shell = window.browserShell;

const state = shallowRef<BrowserShellState>({
  tabs: [],
  activeTabId: null,
  theme: "light",
  locale: localeCode() as BrowserLocale,
  platform: shell.platform,
  isMaximized: false,
  agentInspectorOpen: false,
  agentControl: null,
  downloadPopoverOpen: false,
  downloads: [],
  permissionNotice: null,
});
const chromeEl = useTemplateRef<HTMLElement>("chromeEl");
const addressBarRef = useTemplateRef<InstanceType<typeof BrowserAddressBar>>(
  "addressBarRef",
);
const findBarRef = useTemplateRef<InstanceType<typeof BrowserFindBar>>(
  "findBarRef",
);
const agentCapsuleRef = useTemplateRef<InstanceType<typeof BrowserAgentCapsule>>(
  "agentCapsuleRef",
);
const downloadTriggerRef = useTemplateRef<InstanceType<typeof BrowserDownloadTrigger>>(
  "downloadTriggerRef",
);

const activeTab = computed<BrowserTabState | undefined>(() =>
  state.value.tabs.find((tab) => tab.id === state.value.activeTabId),
);

const isMac = computed(() => state.value.platform === "darwin");
const canHandOffPage = computed(() => /^https?:\/\//u.test(activeTab.value?.url ?? ""));

const unsubscribe = shell.onStateChanged((next) => {
  setLocale(next.locale);
  state.value = next;
  document.documentElement.classList.toggle("dark", next.theme === "dark");
});
const unsubscribeFocusAddress = shell.onFocusAddress(() => {
  addressBarRef.value?.focusInput();
});
const unsubscribeFocusFind = shell.onFocusFind(async () => {
  await nextTick();
  await findBarRef.value?.focusInput();
});
const unsubscribeFocusAgentCapsule = shell.onFocusAgentCapsule(async () => {
  await nextTick();
  agentCapsuleRef.value?.focus();
});
const unsubscribeFocusDownloads = shell.onFocusDownloads(async () => {
  await nextTick();
  downloadTriggerRef.value?.focus();
});

let resizeObserver: ResizeObserver | undefined;

onMounted(() => {
  shell.ready();
  shell.requestState();
  if (chromeEl.value) {
    resizeObserver = new ResizeObserver(() => reportHeight());
    resizeObserver.observe(chromeEl.value);
    reportHeight();
  }
});

onBeforeUnmount(() => {
  unsubscribe();
  unsubscribeFocusAddress();
  unsubscribeFocusFind();
  unsubscribeFocusAgentCapsule();
  unsubscribeFocusDownloads();
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
        :agent-control="state.agentControl"
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

    <BrowserAddressBar ref="addressBarRef" :tab="activeTab"
      :permission-notice="state.permissionNotice"
      @back="shell.goBack()"
      @forward="shell.goForward()" @navigate="shell.navigate($event)"
      @reload="shell.reload()" @stop="shell.stopLoading()"
      @reset-zoom="shell.resetZoom()"
      @dismiss-permission-notice="shell.dismissPermissionNotice()">
      <template #toolbar-end>
        <BrowserPageHandoffButton v-if="canHandOffPage"
          @open="shell.openPageInApp()" />
        <BrowserDownloadTrigger ref="downloadTriggerRef" :downloads="state.downloads"
          :open="state.downloadPopoverOpen"
          @toggle="shell.toggleDownloadPopover()"
          @dismiss="shell.dismissDownload($event)" />
        <BrowserAgentCapsule v-if="state.agentControl" ref="agentCapsuleRef"
          :state="state.agentControl" :expanded="state.agentInspectorOpen"
          @toggle="shell.toggleAgentInspector()" />
      </template>
    </BrowserAddressBar>
    <BrowserNavigationProgress v-if="activeTab" :phase="activeTab.loadPhase"
      :is-loading="activeTab.isLoading" />
    <BrowserFindBar v-if="activeTab?.find.open" :key="activeTab.id" ref="findBarRef"
      :state="activeTab.find"
      @query="shell.searchFind($event)"
      @next="shell.findNext('next')"
      @previous="shell.findNext('previous')"
      @close="shell.closeFind()" />
  </div>
</template>

<style scoped src="./browser-shell-view.css"></style>

<script setup lang="ts">
import { ArrowLeft, ArrowRight, RotateCw } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { BrowserShellState, BrowserTabState } from "@desktop/types";
import BrowserTabStrip from "./BrowserTabStrip.vue";
import BrowserWindowControls from "./BrowserWindowControls.vue";
import BrowserAgentBar from "./BrowserAgentBar.vue";
import { translate } from "../i18n/locale";

const shell = window.browserShell;

const state = ref<BrowserShellState>({
  tabs: [],
  activeTabId: null,
  theme: "light",
  platform: shell.platform,
  isMaximized: false,
  agentControl: null,
});
const chromeEl = ref<HTMLElement>();

const activeTab = computed<BrowserTabState | undefined>(() =>
  state.value.tabs.find((tab) => tab.id === state.value.activeTabId),
);

const addressInput = ref("");
const addressFocused = ref(false);

watch(activeTab, (tab) => {
  if (!addressFocused.value) addressInput.value = tab?.url ?? "";
});

const isMac = computed(() => state.value.platform === "darwin");

const unsubscribe = shell.onStateChanged((next) => {
  state.value = next;
  document.documentElement.classList.toggle("dark", next.theme === "dark");
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
  resizeObserver?.disconnect();
});

watch(() => state.value.tabs.length, () => void reportHeight());

function reportHeight(): void {
  if (chromeEl.value) shell.reportChromeHeight(chromeEl.value.offsetHeight);
}

function addressText(tab: BrowserTabState | undefined): string {
  if (!tab) return "";
  return tab.url ?? translate("Coolto 主页");
}

/**
 * 把用户在地址栏输入的内容规范成可导航 URL：
 *  - 已带协议（http/https/file/data 等）直接用
 *  - 形如域名（含点且无空格）补 https://
 *  - 其余当作搜索词走 Bing
 */
function toNavigableUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }
  const looksLikeDomain = /^[^\s]+\.[^\s]+$/.test(value) && !value.includes(" ");
  if (looksLikeDomain) return `https://${value}`;
  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`;
}

function submitAddress(): void {
  const url = toNavigableUrl(addressInput.value);
  if (!url) return;
  shell.navigate(url);
  (document.activeElement as HTMLElement | null)?.blur();
}

function onAddressFocus(event: FocusEvent): void {
  addressFocused.value = true;
  (event.target as HTMLInputElement).select();
}

function onAddressBlur(): void {
  addressFocused.value = false;
  addressInput.value = activeTab.value?.url ?? "";
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

    <div class="address-row no-drag">
      <div class="nav-actions">
        <button
          class="nav-button"
          type="button"
          :aria-label="$t('后退')"
          :disabled="!activeTab?.canGoBack"
          @click="shell.goBack()"
        >
          <ArrowLeft :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button
          class="nav-button"
          type="button"
          :aria-label="$t('前进')"
          :disabled="!activeTab?.canGoForward"
          @click="shell.goForward()"
        >
          <ArrowRight :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button
          class="nav-button"
          type="button"
          :aria-label="$t('刷新')"
          @click="shell.reload()"
        >
          <RotateCw :size="16" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
      <input
        class="address"
        type="text"
        :value="addressInput"
        :placeholder="addressText(activeTab) || $t('搜索或输入网址')"
        spellcheck="false"
        autocomplete="off"
        :aria-label="$t('地址栏')"
        @input="addressInput = ($event.target as HTMLInputElement).value"
        @focus="onAddressFocus"
        @blur="onAddressBlur"
        @keydown.enter="submitAddress"
      />
    </div>
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

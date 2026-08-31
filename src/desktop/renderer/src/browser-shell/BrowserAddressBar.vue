<script setup lang="ts">
import {
  ArrowLeft, ArrowRight, Globe2, RotateCw, SlidersHorizontal,
  TriangleAlert, X,
} from "@lucide/vue";
import { computed, shallowRef, useTemplateRef, watch } from "vue";

import type {
  BrowserPermissionNotice as PermissionNotice,
  BrowserTabState,
} from "@desktop/types";
import BrowserPermissionNotice from "./BrowserPermissionNotice.vue";
import BrowserZoomBadge from "./BrowserZoomBadge.vue";
import { translate } from "../i18n/locale";

const props = defineProps<{
  permissionNotice: PermissionNotice | null;
  tab: BrowserTabState | undefined;
}>();
const emit = defineEmits<{
  back: [];
  forward: [];
  navigate: [url: string];
  reload: [];
  resetZoom: [];
  stop: [];
  dismissPermissionNotice: [];
}>();
defineSlots<{ "toolbar-end"(): unknown }>();

const draft = shallowRef("");
const focused = shallowRef(false);
const addressInput = useTemplateRef<HTMLInputElement>("addressInput");

watch(
  () => [props.tab?.id, props.tab?.url] as const,
  () => {
    if (!focused.value) draft.value = props.tab?.url ?? "";
  },
  { immediate: true },
);

const siteKind = computed<"failure" | "home" | "http" | "https" | "other">(() => {
  if (props.tab?.failure) return "failure";
  if (!props.tab?.url) return "home";
  try {
    const protocol = new URL(props.tab.url).protocol;
    if (protocol === "https:") return "https";
    if (protocol === "http:") return "http";
  } catch {
    return "other";
  }
  return "other";
});

const siteLabel = computed(() => {
  if (siteKind.value === "failure") return translate("页面加载失败");
  if (siteKind.value === "http") return translate("不安全");
  if (siteKind.value === "home") return translate("主页");
  return translate("站点信息");
});

function submit(): void {
  const url = toNavigableUrl(draft.value);
  if (!url) return;
  emit("navigate", url);
  (document.activeElement as HTMLElement | null)?.blur();
}

function handleAddressKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.key !== "Enter") return;
  event.preventDefault();
  submit();
}

function focusAddress(event: FocusEvent): void {
  focused.value = true;
  (event.target as HTMLInputElement).select();
}

function blurAddress(): void {
  focused.value = false;
  draft.value = props.tab?.url ?? "";
}

function focusInput(): void {
  addressInput.value?.focus();
  addressInput.value?.select();
}

defineExpose({ focusInput });

function toNavigableUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const domain = /^[^\s]+\.[^\s]+$/.test(value) && !value.includes(" ");
  return domain
    ? `https://${value}`
    : `https://www.bing.com/search?q=${encodeURIComponent(value)}`;
}
</script>

<template>
  <div class="address-row no-drag">
    <div class="nav-actions">
      <button class="nav-button" type="button" :aria-label="$t('后退')"
        :title="$t('后退')" :disabled="!tab?.canGoBack" @click="emit('back')">
        <ArrowLeft :size="17" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button class="nav-button" type="button" :aria-label="$t('前进')"
        :title="$t('前进')" :disabled="!tab?.canGoForward" @click="emit('forward')">
        <ArrowRight :size="17" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button v-if="tab?.isLoading" class="nav-button" type="button"
        :aria-label="$t('停止加载')" :title="$t('停止加载')" @click="emit('stop')">
        <X :size="17" :stroke-width="1.9" aria-hidden="true" />
      </button>
      <button v-else class="nav-button" type="button" :aria-label="$t('刷新')"
        :title="$t('刷新')" @click="emit('reload')">
        <RotateCw :size="16" :stroke-width="1.8" aria-hidden="true" />
      </button>
    </div>

    <div class="omnibox" :class="{ failed: siteKind === 'failure' }">
      <span class="site-identity" role="img" :aria-label="siteLabel" :title="siteLabel">
        <TriangleAlert v-if="siteKind === 'failure' || siteKind === 'http'"
          :size="16" :stroke-width="1.9" aria-hidden="true" />
        <SlidersHorizontal v-else-if="siteKind === 'https'"
          :size="15" :stroke-width="1.9" aria-hidden="true" />
        <Globe2 v-else :size="15" :stroke-width="1.8" aria-hidden="true" />
      </span>
      <input ref="addressInput" class="address" type="text" :value="draft"
        :placeholder="$t('搜索或输入网址')" spellcheck="false" autocomplete="off"
        :aria-label="$t('地址栏')"
        @input="draft = ($event.target as HTMLInputElement).value"
        @focus="focusAddress" @blur="blurAddress" @keydown="handleAddressKeydown" />
    </div>
    <BrowserZoomBadge :factor="tab?.zoomFactor ?? 1"
      @reset="emit('resetZoom')" />
    <slot name="toolbar-end" />
    <BrowserPermissionNotice v-if="permissionNotice" :notice="permissionNotice"
      @dismiss="emit('dismissPermissionNotice')" />
  </div>
</template>

<style scoped>
.address-row { display: flex; align-items: center; gap: 8px; min-height: 48px;
  padding: 6px 10px 8px; border-bottom: 1px solid var(--browser-hairline);
  background: var(--browser-toolbar); }
.nav-actions { display: flex; align-items: center; gap: 2px; }
.nav-button { display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border: 0; border-radius: 7px; background: transparent;
  color: var(--text-soft); cursor: pointer; transition: background-color var(--motion-fast)
  var(--ease-out-quart), color var(--motion-fast) var(--ease-out-quart),
  transform var(--motion-instant) var(--ease-out-quart); }
.nav-button:hover:not(:disabled), .nav-button:focus-visible { background: var(--surface-hover); }
.nav-button:active:not(:disabled) { transform: scale(.98); }
.nav-button:focus-visible { outline: 2px solid var(--browser-accent); outline-offset: 2px; }
.nav-button:disabled { opacity: .34; cursor: default; }
.omnibox { flex: 1; min-width: 0; height: 34px; display: flex; align-items: center;
  gap: 8px; padding-inline: 11px 14px; border: 0; border-radius: 18px;
  background: var(--browser-surface); transition: background-color var(--motion-fast)
  var(--ease-out-quart), box-shadow var(--motion-instant) var(--ease-out-quart); }
.omnibox:hover { background: var(--browser-surface-hover); }
.omnibox:focus-within { background: var(--browser-toolbar);
  box-shadow: 0 0 0 1px var(--browser-accent); }
.omnibox.failed { color: var(--danger); }
.site-identity { display: inline-flex; align-items: center; justify-content: center;
  flex: none; color: var(--muted); }
.failed .site-identity { color: var(--danger); }
.address { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent;
  color: var(--text); font: 13px/1 var(--font-ui); text-overflow: ellipsis; }
.address::placeholder { color: var(--text-soft); opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .nav-button, .omnibox { transition: none; }
}
</style>

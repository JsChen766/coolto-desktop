<script setup lang="ts">
import { ChevronLeft, ChevronRight, Plus } from "@lucide/vue";
import { computed, nextTick, shallowRef, useTemplateRef, watch } from "vue";
import type { BrowserAgentChromeView, BrowserTabState } from "@desktop/types";
import {
  browserTabFocusAfterClose, moveBrowserTabFocus, resolveBrowserTabRovingId,
  type BrowserTabMoveDirection,
} from "../../../../browser/browser-tab-roving.js";
import BrowserTabItem from "./BrowserTabItem.vue";
import { useTabStripOverflow } from "./useTabStripOverflow";

const props = defineProps<{
  tabs: BrowserTabState[];
  activeTabId: string | null;
  agentControl: BrowserAgentChromeView | null;
}>();
const emit = defineEmits<{
  select: [tabId: string]; close: [tabId: string]; create: [];
}>();
const viewportEl = useTemplateRef<HTMLElement>("viewportEl");
const trackEl = useTemplateRef<HTMLElement>("trackEl");
const rovingTabId = shallowRef<string | null>(props.activeTabId);
const pendingKeyboardFocus = shallowRef<string | null>(null);
const tabIds = computed(() => props.tabs.map((tab) => tab.id));
const tabIdSignature = computed(() => tabIds.value.join("\u001f"));
const overflow = useTabStripOverflow({
  viewport: viewportEl, track: trackEl, itemCount: () => props.tabs.length,
});

watch(overflow.hasOverflow, async () => {
  await nextTick();
  overflow.ensureVisible(findTabButton(props.activeTabId));
});

watch([tabIdSignature, () => props.activeTabId], async ([signature, activeId]) => {
  const ids = signature ? signature.split("\u001f") : [];
  const pendingId = pendingKeyboardFocus.value;
  if (pendingId && ids.includes(pendingId)) {
    rovingTabId.value = pendingId;
    pendingKeyboardFocus.value = null;
    await focusTab(pendingId);
    return;
  }
  pendingKeyboardFocus.value = null;
  const focusInside = trackEl.value?.contains(document.activeElement) ?? false;
  rovingTabId.value = resolveBrowserTabRovingId(
    ids, focusInside ? rovingTabId.value : activeId, activeId,
  );
  await nextTick();
  overflow.ensureVisible(findTabButton(activeId));
}, { immediate: true });

function handleActivate(tabId: string): void {
  rovingTabId.value = tabId;
  emit("select", tabId);
  overflow.ensureVisible(findTabButton(tabId));
}

function handleMoveFocus(tabId: string, direction: BrowserTabMoveDirection): void {
  const nextId = moveBrowserTabFocus(tabIds.value, tabId, direction);
  if (!nextId) return;
  if (nextId === tabId) return;
  rovingTabId.value = nextId;
  pendingKeyboardFocus.value = nextId;
  emit("select", nextId);
}

function handleClose(
  tabId: string, source: "button" | "middle" | "keyboard",
): void {
  if (source === "keyboard") {
    pendingKeyboardFocus.value = browserTabFocusAfterClose(tabIds.value, tabId);
  }
  emit("close", tabId);
}

function handleFocus(tabId: string): void {
  rovingTabId.value = tabId;
  overflow.ensureVisible(findTabButton(tabId));
}

async function focusTab(tabId: string): Promise<void> {
  await nextTick();
  const button = findTabButton(tabId);
  button?.focus({ preventScroll: true });
  overflow.ensureVisible(button);
}

function findTabButton(tabId: string | null): HTMLButtonElement | null {
  if (!tabId) return null;
  const buttons = trackEl.value?.querySelectorAll<HTMLButtonElement>(
    ".tab-activation[data-tab-id]",
  );
  return [...(buttons ?? [])].find((button) => button.dataset.tabId === tabId) ?? null;
}
</script>

<template>
  <div class="tab-strip">
    <button v-if="overflow.hasOverflow.value" class="tab-scroll no-drag" type="button"
      :disabled="!overflow.canScrollPrevious.value" :aria-label="$t('向前滚动标签页')"
      :title="$t('向前滚动标签页')" @click="overflow.scrollByPage('previous')">
      <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
    </button>
    <div ref="viewportEl" class="tab-viewport">
      <div ref="trackEl" class="tab-track" role="tablist" :aria-label="$t('标签页')">
        <BrowserTabItem v-for="tab in tabs" :key="tab.id" :tab="tab"
          :active="tab.id === activeTabId" :roving="tab.id === rovingTabId"
          :agent-state="agentControl?.targetTabId === tab.id ? agentControl : null"
          @activate="handleActivate" @focus-tab="handleFocus"
          @move-focus="handleMoveFocus" @request-close="handleClose" />
      </div>
    </div>
    <button v-if="overflow.hasOverflow.value" class="tab-scroll no-drag" type="button"
      :disabled="!overflow.canScrollNext.value" :aria-label="$t('向后滚动标签页')"
      :title="$t('向后滚动标签页')" @click="overflow.scrollByPage('next')">
      <ChevronRight :size="14" :stroke-width="2" aria-hidden="true" />
    </button>
    <button class="tab-new no-drag" type="button" :aria-label="$t('新建标签')"
      :title="$t('新建标签')" @click="emit('create')">
      <Plus :size="15" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.tab-strip { display: flex; align-items: flex-end; gap: 2px; min-width: 0;
  padding: 6px 8px 0; overflow: hidden; }
.tab-viewport { flex: 1 1 auto; min-width: 0; overflow-x: auto; overflow-y: hidden;
  scrollbar-width: none; }
.tab-viewport::-webkit-scrollbar { display: none; }
.tab-track { display: flex; align-items: flex-end; gap: 2px; min-width: 100%; }
.tab-scroll, .tab-new { display: inline-flex; align-items: center; justify-content: center;
  flex: none; width: 28px; height: 28px; margin-bottom: 3px; padding: 0; border: 0;
  border-radius: 7px; background: transparent; color: var(--muted);
  transition: background-color 140ms ease-out, color 140ms ease-out; }
.tab-scroll { width: 24px; }
.tab-scroll:hover:not(:disabled), .tab-new:hover {
  background: var(--surface-hover); color: var(--text); }
.tab-scroll:disabled { opacity: 0.35; }
.tab-scroll:focus-visible, .tab-new:focus-visible {
  outline: 2px solid var(--browser-accent); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) {
  .tab-scroll, .tab-new { transition: none; }
}
</style>

<script setup lang="ts">
import { Globe2, X } from "@lucide/vue";
import { computed, shallowRef, watch } from "vue";
import type { BrowserAgentChromeView, BrowserTabState } from "@desktop/types";
import type { BrowserTabMoveDirection } from "../../../../browser/browser-tab-roving.js";
import BrowserAgentTabMarker from "./BrowserAgentTabMarker.vue";

const props = defineProps<{
  tab: BrowserTabState;
  active: boolean;
  roving: boolean;
  agentState: BrowserAgentChromeView | null;
}>();
const emit = defineEmits<{
  activate: [tabId: string];
  focusTab: [tabId: string];
  moveFocus: [tabId: string, direction: BrowserTabMoveDirection];
  requestClose: [tabId: string, source: "button" | "middle" | "keyboard"];
}>();
const faviconFailed = shallowRef(false);
const tooltip = computed(() => props.tab.url
  ? `${props.tab.title}\n${props.tab.url}` : props.tab.title);

watch(() => props.tab.faviconUrl, () => { faviconFailed.value = false; });

function handleKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.repeat || event.shiftKey ||
    event.altKey || event.ctrlKey || event.metaKey) return;
  const moves: Partial<Record<string, BrowserTabMoveDirection>> = {
    ArrowLeft: "previous", ArrowRight: "next", Home: "first", End: "last",
  };
  const direction = moves[event.key];
  if (direction) {
    event.preventDefault();
    emit("moveFocus", props.tab.id, direction);
  } else if (event.key === "Delete") {
    event.preventDefault();
    emit("requestClose", props.tab.id, "keyboard");
  }
}

function handleMiddleClick(event: MouseEvent): void {
  if (event.button !== 1) return;
  event.preventDefault();
  event.stopPropagation();
  emit("requestClose", props.tab.id, "middle");
}
</script>

<template>
  <div class="tab-item no-drag" :class="{ active, 'agent-target': agentState }"
    role="presentation">
    <button class="tab-activation" type="button" role="tab"
      :data-tab-id="tab.id" :tabindex="roving ? 0 : -1"
      :aria-selected="active" :aria-busy="tab.isLoading" aria-keyshortcuts="Delete"
      :title="tooltip"
      @click="emit('activate', tab.id)" @focus="emit('focusTab', tab.id)"
      @keydown="handleKeydown" @mousedown.middle.prevent @auxclick="handleMiddleClick">
      <span class="tab-site-icon" aria-hidden="true">
        <span v-if="tab.isLoading" class="tab-spinner" />
        <img v-else-if="tab.faviconUrl && !faviconFailed" :src="tab.faviconUrl" alt=""
          @load="faviconFailed = false" @error="faviconFailed = true" />
        <Globe2 v-else :size="15" :stroke-width="1.7" />
      </span>
      <BrowserAgentTabMarker v-if="agentState" :state="agentState" />
      <span class="tab-title">{{ tab.title }}</span>
    </button>
    <button class="tab-close" type="button" tabindex="-1"
      :aria-label="$tf('关闭标签：{title}', { title: tab.title })"
      :title="$tf('关闭标签：{title}', { title: tab.title })"
      @click.stop="emit('requestClose', tab.id, $event.detail === 0 ? 'keyboard' : 'button')"
      @mousedown.middle.prevent @auxclick="handleMiddleClick">
      <X :size="13" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.tab-item { position: relative; container-type: inline-size; flex: 0 0 220px;
  min-width: 72px; max-width: 240px;
  height: 34px; border-radius: 9px 9px 0 0; color: var(--text-soft);
  transition: background-color 140ms ease-out, color 140ms ease-out; }
.tab-item:hover { background: var(--surface-hover); }
.tab-item.active { background: var(--browser-toolbar); color: var(--text); }
.tab-activation { display: flex; align-items: center; gap: 6px; width: 100%; height: 100%;
  padding: 0 30px 0 10px; border: 0; border-radius: inherit; background: transparent;
  color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: default; }
.tab-activation:focus-visible, .tab-close:focus-visible {
  outline: 2px solid var(--browser-accent); outline-offset: -2px; }
.tab-site-icon { position: relative; display: grid; place-items: center; flex: none;
  width: 16px; height: 16px; color: var(--muted); }
.tab-site-icon img { width: 16px; height: 16px; object-fit: contain;
  animation: favicon-in 120ms ease-out; }
.tab-title { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
.tab-close { position: absolute; top: 7px; right: 4px; display: inline-flex;
  align-items: center; justify-content: center; width: 20px; height: 20px; padding: 0;
  border: 0; border-radius: 6px; background: transparent; color: inherit; opacity: 0;
  pointer-events: none; transition: opacity 140ms ease-out, background-color 140ms ease-out; }
.tab-item.active .tab-close, .tab-item:hover .tab-close,
.tab-item:focus-within .tab-close { opacity: 0.72; pointer-events: auto; }
.tab-close:hover { background: var(--surface-strong); opacity: 1; }
.tab-spinner { width: 12px; height: 12px; border: 2px solid var(--border-strong);
  border-top-color: var(--text-soft); border-radius: 50%; animation: shell-spin 0.7s linear infinite; }
@keyframes shell-spin { to { transform: rotate(360deg); } }
@keyframes favicon-in { from { opacity: 0; } }
@container (max-width: 88px) {
  .agent-target .tab-site-icon { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .tab-item, .tab-close, .tab-site-icon img { transition: none; animation: none; }
  .tab-spinner { animation: none; }
}
</style>

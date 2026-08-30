<script setup lang="ts">
import { Globe2, Plus, X } from "@lucide/vue";

import type { BrowserTabState } from "@desktop/types";

defineProps<{
  tabs: BrowserTabState[];
  activeTabId: string | null;
}>();

defineEmits<{
  select: [tabId: string];
  close: [tabId: string];
  create: [];
}>();
</script>

<template>
  <div class="tab-strip">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="tab no-drag"
      :class="{ active: tab.id === activeTabId }"
      :title="tab.url ? `${tab.title}\n${tab.url}` : tab.title"
      @click="$emit('select', tab.id)"
    >
      <span class="tab-site-icon" aria-hidden="true">
        <Globe2 :size="14" :stroke-width="1.7" />
        <img v-if="tab.faviconUrl && !tab.isLoading" :src="tab.faviconUrl" alt=""
          @error="($event.currentTarget as HTMLImageElement).hidden = true" />
        <span v-if="tab.isLoading" class="tab-spinner" />
      </span>
      <span class="tab-title">{{ tab.title }}</span>
      <button
        class="tab-close"
        type="button"
        :aria-label="$t('关闭标签')"
        @click.stop="$emit('close', tab.id)"
      >
        <X :size="13" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>
    <button
      class="tab-new no-drag"
      type="button"
      :aria-label="$t('新建标签')"
      @click="$emit('create')"
    >
      <Plus :size="15" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.tab-strip {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 6px 8px 0;
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 220px;
  min-width: 120px;
  height: 34px;
  padding: 0 8px 0 12px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 9px 9px 0 0;
  font-size: 12.5px;
  color: var(--text-soft);
  cursor: default;
}

.tab:hover {
  background: var(--surface-hover);
}

.tab.active {
  background: var(--surface);
  border-color: var(--border);
  color: var(--text);
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-site-icon { position: relative; display: grid; place-items: center; flex: none;
  width: 15px; height: 15px; color: var(--muted); }
.tab-site-icon img { position: absolute; inset: 0; width: 15px; height: 15px; object-fit: contain; }

.tab-close,
.tab-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 6px;
  cursor: default;
}

.tab-close {
  width: 20px;
  height: 20px;
  flex: none;
  opacity: 0.6;
}

.tab-close:hover {
  background: var(--surface-strong);
  opacity: 1;
}

.tab-new {
  width: 28px;
  height: 28px;
  flex: none;
  color: var(--muted);
}

.tab-new:hover {
  background: var(--surface-hover);
}

.tab-spinner {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--text-soft);
  border-radius: 50%;
  animation: shell-spin 0.7s linear infinite;
}

@keyframes shell-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

<script setup lang="ts">
import { Download, LoaderCircle } from "@lucide/vue";
import { computed, useTemplateRef } from "vue";

import type { BrowserDownloadView } from "@desktop/types";

const props = defineProps<{ downloads: BrowserDownloadView[]; open: boolean }>();
const emit = defineEmits<{ toggle: [] }>();
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const activeCount = computed(() => props.downloads
  .filter((download) => download.status === "progressing").length);
defineExpose({ focus: () => trigger.value?.focus() });
</script>

<template>
  <button v-if="downloads.length" ref="trigger" class="download-trigger"
    :class="{ active: open }"
    type="button" :aria-label="activeCount === 1
      ? $t('正在下载 1 个文件')
      : activeCount > 1 ? $tf('正在下载 {count} 个文件', { count: activeCount })
      : $tf('查看下载（{count}）', { count: downloads.length })"
    :title="activeCount === 1 ? $t('正在下载 1 个文件')
      : activeCount > 1 ? $tf('正在下载 {count} 个文件', { count: activeCount })
      : $tf('查看下载（{count}）', { count: downloads.length })"
    :aria-expanded="open" aria-haspopup="dialog" @click="emit('toggle')">
    <LoaderCircle v-if="activeCount" class="spin" :size="17"
      :stroke-width="1.9" aria-hidden="true" />
    <Download v-else :size="17" :stroke-width="1.9" aria-hidden="true" />
    <span class="download-count" aria-hidden="true">{{ activeCount || downloads.length }}</span>
  </button>
</template>

<style scoped>
.download-trigger { position: relative; display: inline-flex; align-items: center;
  justify-content: center; width: 32px; height: 32px; border: 0; border-radius: 7px;
  background: transparent; color: var(--text-soft); cursor: pointer; }
.download-trigger:hover, .download-trigger:focus-visible, .download-trigger.active {
  background: var(--surface-hover); }
.download-trigger:focus-visible { outline: 2px solid var(--selection-bg); outline-offset: 1px; }
.download-count { position: absolute; right: -2px; bottom: -1px; min-width: 15px;
  height: 15px; padding: 0 3px; border-radius: 8px; background: var(--text);
  color: var(--bg); font: 600 9px/15px var(--font-ui); }
.spin { animation: spin .9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
</style>

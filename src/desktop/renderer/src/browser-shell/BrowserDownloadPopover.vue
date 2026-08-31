<script setup lang="ts">
import {
  CheckCircle2, CircleX, LoaderCircle, TriangleAlert, X,
} from "@lucide/vue";
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef } from "vue";

import type {
  BrowserDownloadPopoverViewState,
  BrowserDownloadStatus,
  BrowserDownloadView,
} from "@desktop/types";
import { setLocale } from "../i18n/locale";

const api = window.browserDownloadPopover;
const state = shallowRef<BrowserDownloadPopoverViewState>({
  downloads: [], locale: "zh-CN", theme: "light",
});
const closeButton = useTemplateRef<HTMLButtonElement>("closeButton");
const activeCount = computed(() => state.value.downloads
  .filter((download) => download.status === "progressing").length);
const unsubscribe = api.onStateChanged((next) => {
  state.value = next;
  setLocale(next.locale);
  document.documentElement.classList.toggle("dark", next.theme === "dark");
});
const unsubscribeFocus = api.onFocus(async () => {
  await nextTick();
  closeButton.value?.focus();
});
onBeforeUnmount(() => { unsubscribe(); unsubscribeFocus(); });
api.ready();

function statusLabel(status: BrowserDownloadStatus): string {
  if (status === "progressing") return "下载中";
  if (status === "completed") return "下载完成";
  if (status === "cancelled") return "下载已取消";
  return "下载已中断";
}
function iconFor(status: BrowserDownloadStatus) {
  if (status === "progressing") return LoaderCircle;
  if (status === "completed") return CheckCircle2;
  if (status === "cancelled") return CircleX;
  return TriangleAlert;
}
function progress(download: BrowserDownloadView): number | null {
  if (download.totalBytes <= 0) return null;
  return Math.min(100, Math.round(download.receivedBytes / download.totalBytes * 100));
}
function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
  if (bytes < 1_073_741_824) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
}
</script>

<template>
  <section class="download-popover" role="dialog" aria-modal="false"
    :aria-label="$t('下载')">
    <header class="download-header">
      <div>
        <h1>{{ $t('下载') }}</h1>
        <p aria-live="polite">{{ activeCount === 1
          ? $t('正在下载 1 个文件')
          : activeCount > 1
            ? $tf('正在下载 {count} 个文件', { count: activeCount }) : $t('最近下载') }}</p>
      </div>
      <button ref="closeButton" class="icon-button" type="button"
        :aria-label="$t('关闭下载')"
        :title="$t('关闭下载')" @click="api.close()">
        <X :size="16" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </header>
    <ol class="download-list app-scrollbar">
      <li v-for="download in state.downloads" :key="download.id" class="download-row">
        <component :is="iconFor(download.status)" class="status-icon"
          :class="download.status" :size="17" :stroke-width="1.9" aria-hidden="true" />
        <div class="download-copy">
          <strong :title="download.filename">{{ download.filename }}</strong>
          <span>{{ download.sourceOrigin ?? $t('未知来源') }}</span>
          <div class="download-state">
            <span>{{ $t(statusLabel(download.status)) }}</span>
            <span v-if="progress(download) !== null">{{ progress(download) }}%</span>
            <span v-else>{{ formatBytes(download.receivedBytes) }}</span>
          </div>
          <progress v-if="download.status === 'progressing'"
            :value="progress(download) ?? undefined" max="100"
            :aria-label="$tf('{filename} 下载进度', { filename: download.filename })" />
        </div>
        <button v-if="download.status !== 'progressing'" class="icon-button dismiss"
          type="button" :aria-label="$tf('移除下载记录：{filename}', {
            filename: download.filename,
          })" :title="$t('移除下载记录')" @click="api.dismiss(download.id)">
          <X :size="14" :stroke-width="1.9" aria-hidden="true" />
        </button>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.download-popover { --bg: var(--browser-canvas); --surface: var(--browser-surface);
  --surface-strong: var(--browser-surface-strong); --surface-hover: var(--browser-surface-hover);
  --border: var(--browser-hairline); --text: var(--browser-text);
  --text-soft: var(--browser-text-secondary); --muted: var(--browser-text-muted);
  --danger: var(--browser-danger); --selection-bg: var(--browser-surface-strong);
  --shadow-menu: var(--browser-panel-shadow); height: 100vh; overflow: hidden;
  border: 0; border-radius: 10px; background: var(--bg);
  color: var(--text); box-shadow: var(--shadow-menu); }
.download-header { display: flex; align-items: flex-start; justify-content: space-between;
  padding: 14px 14px 11px; border-bottom: 1px solid var(--border); }
.download-header h1 { margin: 0; font: 600 14px/1.3 var(--font-ui); }
.download-header p { margin: 3px 0 0; color: var(--browser-secondary-text);
  font-size: 12px; }
.icon-button { display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent;
  color: var(--text-soft); cursor: pointer; }
.icon-button:hover, .icon-button:focus-visible { background: var(--surface-hover); }
.icon-button:focus-visible { outline: 2px solid var(--selection-bg); outline-offset: 1px; }
.download-list { max-height: calc(100vh - 62px); margin: 0; padding: 4px; overflow: auto;
  list-style: none; }
.download-row { display: grid; grid-template-columns: 18px minmax(0, 1fr) 28px;
  gap: 9px; align-items: start; padding: 10px 8px; border-radius: 8px; }
.download-row:hover { background: var(--surface); }
.status-icon { margin-top: 2px; color: var(--muted); }
.status-icon.completed { color: var(--browser-success); }
.status-icon.cancelled, .status-icon.interrupted { color: var(--danger); }
.download-copy { min-width: 0; display: grid; gap: 4px; }
.download-copy strong { overflow: hidden; font: 600 12.5px/1.35 var(--font-ui);
  text-overflow: ellipsis; white-space: nowrap; }
.download-copy > span { overflow: hidden; color: var(--browser-secondary-text);
  font-size: 11.5px;
  text-overflow: ellipsis; white-space: nowrap; }
.download-state { display: flex; justify-content: space-between; gap: 8px;
  color: var(--text-soft); font-size: 11.5px; }
progress { width: 100%; height: 3px; border: 0; accent-color: var(--browser-accent); }
.dismiss { margin-top: -3px; }
@media (prefers-reduced-motion: no-preference) {
  .download-popover { animation: download-enter var(--motion-standard) var(--ease-out-quart)
    both; }
}
@keyframes download-enter { from { opacity: 0; transform: translateY(-4px); } }
</style>

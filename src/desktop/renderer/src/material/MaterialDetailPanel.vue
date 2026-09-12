<script setup lang="ts">
import { FileText, Trash2 } from "@lucide/vue";

import type { MaterialApi, MaterialView } from "@desktop/types/material";
import MaterialOcrReview from "./MaterialOcrReview.vue";
import MaterialRelationComposer from "./MaterialRelationComposer.vue";

defineProps<{ material: MaterialView; api?: MaterialApi; busy?: boolean }>();
const emit = defineEmits<{ ocr: []; confirmOcr: [text?: string]; delete: []; changed: []; error: [message: string] }>();

function statusLabel(status: MaterialView["status"]): string {
  return {
    unclassified: "未归类", queued: "等待 OCR", processing: "处理中", needs_confirmation: "待确认",
    ready: "已整理", failed: "处理失败", expired: "OCR 已过期",
  }[status];
}
</script>

<template>
  <aside class="material-detail-panel" aria-label="材料详情">
    <header class="material-detail-header">
      <div class="material-detail-title">
        <FileText :size="17" aria-hidden="true" />
        <div><h2>{{ material.title }}</h2><small>{{ material.originalFilename || $t('本地材料') }}</small></div>
      </div>
      <button class="icon-button" type="button" :aria-label="$t('删除材料')" :title="$t('删除材料')" @click="emit('delete')">
        <Trash2 :size="16" aria-hidden="true" />
      </button>
    </header>
    <dl class="material-meta-grid">
      <dt>{{ $t('状态') }}</dt><dd>{{ statusLabel(material.status) }}</dd>
      <dt>{{ $t('类型') }}</dt><dd>{{ material.mediaKind }}</dd>
      <dt>{{ $t('来源') }}</dt><dd>{{ material.sourceLabel || material.sourceKind }}</dd>
      <dt>{{ $t('引用') }}</dt><dd>{{ material.citationCount }}</dd>
    </dl>
    <section class="material-preview-section">
      <h3>{{ $t('本地预览') }}</h3>
      <p v-if="material.previewText">{{ material.previewText }}<span v-if="material.previewTruncated">…</span></p>
      <p v-else class="material-muted">{{ $t('正文仍保存在主进程，当前没有可显示的预览。') }}</p>
    </section>
    <MaterialOcrReview
      v-if="material.ocrConfidence !== null || material.status === 'needs_confirmation'"
      :material="material"
      :busy="busy"
      @confirm="emit('confirmOcr', $event)"
    />
    <button v-if="material.status === 'queued' || material.status === 'failed' || material.status === 'expired'" class="secondary-button" type="button" :disabled="busy" @click="emit('ocr')">
      {{ busy ? $t('正在处理…') : $t('开始本地 OCR') }}
    </button>
    <MaterialRelationComposer
      v-if="api && (material.status === 'ready' || material.status === 'unclassified')"
      :api="api"
      :material="material"
      :busy="busy"
      @changed="emit('changed')"
      @error="emit('error', $event)"
    />
    <p v-if="material.lastError" class="material-error" role="alert">{{ material.lastError }}</p>
  </aside>
</template>

<style scoped>
.material-detail-panel { min-width: 0; height: 100%; overflow-y: auto; padding: 18px; border-left: 1px solid var(--border); }
.material-detail-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.material-detail-title { display: flex; align-items: flex-start; gap: 9px; min-width: 0; }
.material-detail-title h2 { margin: 0; font-size: 16px; overflow-wrap: anywhere; }
.material-detail-title small { display: block; margin-top: 4px; color: var(--muted); overflow-wrap: anywhere; }
.material-meta-grid { display: grid; grid-template-columns: 86px minmax(0, 1fr); gap: 8px 12px; margin: 20px 0; font-size: 12px; }
.material-meta-grid dt { color: var(--muted); }
.material-meta-grid dd { margin: 0; overflow-wrap: anywhere; }
.material-preview-section { padding: 14px 0; border-top: 1px solid var(--border); }
.material-preview-section h3 { margin: 0 0 8px; font-size: 12px; }
.material-preview-section p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--text-soft); line-height: 1.55; }
.material-muted { color: var(--muted) !important; }
.material-error { margin: 12px 0 0; color: var(--accent-strong); font-size: 12px; }
@media (max-width: 940px) { .material-detail-panel { border-left: 0; border-top: 1px solid var(--border); } }
</style>

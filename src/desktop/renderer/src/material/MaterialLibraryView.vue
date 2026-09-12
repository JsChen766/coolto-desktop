<script setup lang="ts">
import { Download, FolderOpen, Plus, Search, SlidersHorizontal, Upload } from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";

import type { MaterialApi, MaterialSearchOptions, MaterialView } from "@desktop/types/material";
import MaterialDetailPanel from "./MaterialDetailPanel.vue";
import MaterialImpactPreview from "./MaterialImpactPreview.vue";
import type { MaterialDeleteImpact } from "@desktop/types/material";

const props = defineProps<{ api?: MaterialApi }>();
const emit = defineEmits<{ toggleSidebar: []; openChat: [] }>();
const api = computed(() => props.api ?? resolveMaterialApi());
const materials = ref<MaterialView[]>([]);
const selectedId = ref<string>();
const query = ref("");
const status = ref<MaterialView["status"] | "">("");
const loading = ref(false);
const busy = ref(false);
const error = ref<string>();
const notice = ref<string>();
const unavailable = ref(false);
const impact = ref<MaterialDeleteImpact>();

const selected = computed(() => materials.value.find((material) => material.materialId === selectedId.value));
onMounted(() => { void load(); });
watch([query, status], () => { void load(); });

let loadSequence = 0;

async function load(): Promise<void> {
  if (!api.value) { unavailable.value = true; return; }
  const sequence = ++loadSequence;
  const options: MaterialSearchOptions = {};
  const normalizedQuery = query.value.trim();
  if (normalizedQuery) options.query = normalizedQuery;
  if (status.value) options.status = status.value;
  loading.value = true;
  error.value = undefined;
  try {
    const result = await api.value.list(options);
    if (sequence !== loadSequence) return;
    materials.value = result;
    if (!options.query && selectedId.value && !materials.value.some((item) => item.materialId === selectedId.value)) selectedId.value = undefined;
  } catch (cause: unknown) {
    if (sequence !== loadSequence) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

async function chooseFiles(): Promise<void> {
  if (!api.value) return;
  busy.value = true;
  error.value = undefined;
  try {
    const files = await api.value.select();
    for (const file of files) {
      const view = await api.value.import({ fileId: file.id, title: file.filename });
      selectedId.value = view.materialId;
    }
    await load();
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function exportPackage(): Promise<void> {
  if (!api.value?.exportPackage) return;
  busy.value = true;
  error.value = undefined;
  try {
    const receipt = await api.value.exportPackage();
    if (receipt) notice.value = `${receipt.recordCount} 份材料已导出（${receipt.byteLength} bytes，${receipt.sha256.slice(0, 12)}…）`;
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function restorePackage(): Promise<void> {
  if (!api.value?.restorePackage) return;
  busy.value = true;
  error.value = undefined;
  try {
    const restored = await api.value.restorePackage();
    if (restored !== null) { notice.value = `已恢复 ${restored} 份材料`; await load(); }
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function runOcr(): Promise<void> {
  if (!api.value || !selected.value) return;
  busy.value = true;
  try { await api.value.processOcr(selected.value.materialId); await load(); }
  catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}

async function confirmOcr(text?: string): Promise<void> {
  if (!api.value || !selected.value) return;
  busy.value = true;
  try { await api.value.confirmOcr(selected.value.materialId, text); await load(); }
  catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}

function showError(message: string): void {
  error.value = message;
}

async function previewDelete(): Promise<void> {
  if (!api.value || !selected.value) return;
  try { impact.value = await api.value.previewDelete(selected.value.materialId); }
  catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : String(cause); }
}

async function cancelDelete(): Promise<void> {
  if (api.value && impact.value) await api.value.cancelDelete(impact.value.confirmationToken);
  impact.value = undefined;
}

async function confirmDelete(): Promise<void> {
  if (!api.value || !impact.value) return;
  busy.value = true;
  try { await api.value.confirmDelete(impact.value.confirmationToken); impact.value = undefined; selectedId.value = undefined; await load(); }
  catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { busy.value = false; }
}

function resolveMaterialApi(): MaterialApi | undefined {
  const root = window as unknown as { coolto?: { material?: MaterialApi } };
  return root.coolto?.material;
}
</script>

<template>
  <div class="material-library-view">
    <header class="material-library-header">
      <div class="material-library-title"><FolderOpen :size="19" aria-hidden="true" /><div><h1>{{ $t('材料库') }}</h1><p>{{ $t('本机材料、解析和引用关系') }}</p></div></div>
      <div class="material-library-actions">
        <button class="icon-button" type="button" :aria-label="$t('打开侧栏')" :title="$t('打开侧栏')" @click="emit('toggleSidebar')"><SlidersHorizontal :size="16" aria-hidden="true" /></button>
        <button class="secondary-button icon-label" type="button" :disabled="busy || !api" @click="restorePackage"><Upload :size="15" aria-hidden="true" />{{ $t('恢复备份') }}</button>
        <button class="secondary-button icon-label" type="button" :disabled="busy || !api" @click="exportPackage"><Download :size="15" aria-hidden="true" />{{ $t('导出备份') }}</button>
        <button class="primary-button icon-label" type="button" :disabled="busy || !api" @click="chooseFiles"><Plus :size="15" aria-hidden="true" />{{ $t('导入材料') }}</button>
      </div>
    </header>
    <div v-if="unavailable" class="material-state"><strong>{{ $t('材料宿主尚未接入') }}</strong><p>{{ $t('当前窗口没有暴露 MaterialHostPort；原始文件不会通过 Renderer 绕行。') }}</p></div>
    <div v-else class="material-library-body">
      <section class="material-list-pane" aria-label="材料列表">
        <div class="material-filters">
          <label class="material-search"><Search :size="15" aria-hidden="true" /><input v-model="query" :aria-label="$t('搜索材料')" :placeholder="$t('搜索材料')" /></label>
          <select v-model="status" :aria-label="$t('按状态筛选')"><option value="">{{ $t('全部状态') }}</option><option value="unclassified">{{ $t('未归类') }}</option><option value="needs_confirmation">{{ $t('待确认') }}</option><option value="ready">{{ $t('已整理') }}</option><option value="expired">{{ $t('OCR 已过期') }}</option><option value="failed">{{ $t('处理失败') }}</option></select>
        </div>
        <div v-if="loading" class="material-state">{{ $t('正在加载…') }}</div>
        <div v-else-if="!materials.length" class="material-state"><strong>{{ $t('还没有材料') }}</strong><p>{{ $t('选择 PDF、DOCX、TXT、MD、PNG 或 JPG，材料只保存在本机。') }}</p><button class="secondary-button" type="button" @click="chooseFiles">{{ $t('选择本地文件') }}</button></div>
        <button v-for="material in materials" v-else :key="material.materialId" class="material-row" :class="{ active: selectedId === material.materialId }" type="button" @click="selectedId = material.materialId">
          <span class="material-row-main"><strong>{{ material.title }}</strong><small>{{ material.originalFilename || material.mediaKind }}</small></span>
          <span class="material-row-side"><span class="material-status">{{ material.status }}</span><small>{{ material.citationCount }} {{ $t('引用') }}</small></span>
        </button>
      </section>
      <MaterialDetailPanel v-if="selected && api" :api="api" :material="selected" :busy="busy" @ocr="runOcr" @confirm-ocr="confirmOcr" @delete="previewDelete" @changed="load" @error="showError" />
      <div v-else class="material-empty-detail"><FolderOpen :size="24" aria-hidden="true" /><p>{{ $t('选择一份材料查看来源、解析和 OCR 状态。') }}</p></div>
    </div>
    <p v-if="notice" class="material-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="material-error" role="alert">{{ error }}</p>
    <div v-if="impact" class="material-overlay"><MaterialImpactPreview :impact="impact" :busy="busy" @cancel="cancelDelete" @confirm="confirmDelete" /></div>
  </div>
</template>

<style scoped>
.material-library-view { display: flex; flex-direction: column; width: 100%; height: 100%; min-width: 0; background: var(--bg); }
.material-library-header { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px 22px 14px; border-bottom: 1px solid var(--border); }
.material-library-title, .material-library-actions, .material-library-title > div { display: flex; align-items: center; gap: 9px; }
.material-library-title h1 { margin: 0; font-size: 17px; }
.material-library-title p { margin: 3px 0 0; color: var(--muted); font-size: 11px; }
.material-library-body { display: grid; grid-template-columns: minmax(300px, .95fr) minmax(320px, 1.05fr); flex: 1; min-height: 0; }
.material-list-pane { min-width: 0; overflow-y: auto; padding: 14px 16px; }
.material-filters { display: flex; gap: 8px; margin-bottom: 12px; }
.material-search { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; padding: 0 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); color: var(--muted); }
.material-search input, .material-filters select { min-width: 0; height: 34px; border: 0; outline: 0; background: transparent; color: var(--text); }
.material-filters select { border: 1px solid var(--border); border-radius: 9px; padding: 0 8px; }
.material-row { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; padding: 12px 10px; border-bottom: 1px solid var(--border); background: transparent; text-align: left; }
.material-row:hover, .material-row.active { background: var(--surface); }
.material-row-main, .material-row-side { display: grid; gap: 4px; min-width: 0; }
.material-row-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.material-row small, .material-row-side { color: var(--muted); font-size: 11px; }
.material-row-side { flex: none; justify-items: end; }
.material-status { color: var(--text-soft); }
.material-empty-detail, .material-state { display: grid; place-items: center; align-content: center; gap: 9px; min-height: 180px; padding: 24px; color: var(--muted); text-align: center; }
.material-state strong { color: var(--text); }
.material-state p { max-width: 360px; margin: 0; line-height: 1.5; }
.material-error { margin: 0; padding: 9px 18px; color: var(--accent-strong); font-size: 12px; }
.material-notice { margin: 0; padding: 9px 18px; color: var(--text-soft); font-size: 12px; }
.material-overlay { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: 20px; background: rgb(0 0 0 / 28%); }
@media (max-width: 940px) { .material-library-body { grid-template-columns: 1fr; overflow-y: auto; } .material-list-pane { max-height: 52%; } .material-library-header { padding-inline: 14px; } }
@media (max-width: 560px) { .material-filters { flex-direction: column; } .material-library-title p { display: none; } }
</style>

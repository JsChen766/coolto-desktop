<script setup lang="ts">
import { Archive } from "@lucide/vue";
import { computed, onMounted, ref, watch } from "vue";

import type { MaterialApi, MaterialSearchOptions, MaterialView } from "@desktop/types/material";
import MaterialDetailPanel from "./MaterialDetailPanel.vue";
import MaterialImpactPreview from "./MaterialImpactPreview.vue";
import MaterialLibraryHeader from "./MaterialLibraryHeader.vue";
import MaterialLibraryList from "./MaterialLibraryList.vue";
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
const detailOpen = ref(false);

const selected = computed(() => materials.value.find((m) => m.materialId === selectedId.value));
const filterActive = computed(() => Boolean(query.value.trim() || status.value));
const catalogEmpty = computed(() => !loading.value && !materials.value.length && !filterActive.value);

onMounted(() => { void load(); });
watch([query, status], () => { void load(); });
watch(materials, (list) => {
  if (!list.length) {
    selectedId.value = undefined;
    detailOpen.value = false;
    return;
  }
  if (!selectedId.value || !list.some((item) => item.materialId === selectedId.value)) {
    selectedId.value = list[0]?.materialId;
  }
});

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
  } catch (cause: unknown) {
    if (sequence !== loadSequence) return;
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    if (sequence === loadSequence) loading.value = false;
  }
}

function selectMaterial(materialId: string): void {
  selectedId.value = materialId;
  detailOpen.value = true;
}

function clearFilters(): void {
  query.value = "";
  status.value = "";
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
      detailOpen.value = true;
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
    if (receipt) {
      notice.value = `${receipt.recordCount} 份材料已导出（${receipt.byteLength} bytes，${receipt.sha256.slice(0, 12)}…）`;
    }
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
  try {
    await api.value.confirmDelete(impact.value.confirmationToken);
    impact.value = undefined;
    selectedId.value = undefined;
    detailOpen.value = false;
    await load();
  } catch (cause: unknown) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

function resolveMaterialApi(): MaterialApi | undefined {
  const root = window as unknown as { coolto?: { material?: MaterialApi } };
  return root.coolto?.material;
}
</script>

<template>
  <div class="material-library-view tracker-view" :class="{ 'detail-open': detailOpen }">
    <MaterialLibraryHeader
      :query="query"
      :status="status"
      :loading="loading"
      :busy="busy"
      :api-ready="Boolean(api)"
      @update:query="query = $event"
      @update:status="status = $event"
      @toggle-sidebar="emit('toggleSidebar')"
      @import-files="chooseFiles"
      @export-package="exportPackage"
      @restore-package="restorePackage"
      @refresh="load"
      @clear-filters="clearFilters"
    />
    <div v-if="unavailable" class="material-page-state">
      <strong>{{ $t('材料宿主尚未接入') }}</strong>
      <p>{{ $t('当前窗口没有暴露 MaterialHostPort；原始文件不会通过 Renderer 绕行。') }}</p>
    </div>
    <div v-else-if="loading && catalogEmpty" class="material-page-state">{{ $t('正在加载…') }}</div>
    <div v-else-if="catalogEmpty" class="material-page-state">
      <Archive :size="23" aria-hidden="true" />
      <strong>{{ $t('还没有材料') }}</strong>
      <p>{{ $t('选择 PDF、DOCX、TXT、MD、PNG 或 JPG，材料只保存在本机。') }}</p>
      <button class="primary-button" type="button" :disabled="busy || !api" @click="chooseFiles">
        {{ $t('导入材料') }}
      </button>
    </div>
    <div v-else-if="!materials.length" class="material-page-state">
      <strong>{{ $t('没有符合当前搜索或筛选条件的材料') }}</strong>
      <button class="secondary-button" type="button" @click="clearFilters">{{ $t('清除筛选') }}</button>
    </div>
    <div v-else class="material-library-body">
      <MaterialLibraryList
        :materials="materials"
        :selected-id="selectedId"
        @select="selectMaterial"
      />
      <div class="material-detail-pane">
        <MaterialDetailPanel
          v-if="selected && api"
          :api="api"
          :material="selected"
          :busy="busy"
          @back="detailOpen = false"
          @ocr="runOcr"
          @confirm-ocr="confirmOcr"
          @delete="previewDelete"
          @changed="load"
          @error="showError"
        />
      </div>
    </div>
    <p v-if="notice" class="material-notice" role="status">{{ notice }}</p>
    <p v-if="error" class="material-error-banner" role="alert">{{ error }}</p>
    <div v-if="impact" class="material-overlay">
      <MaterialImpactPreview :impact="impact" :busy="busy" @cancel="cancelDelete" @confirm="confirmDelete" />
    </div>
  </div>
</template>

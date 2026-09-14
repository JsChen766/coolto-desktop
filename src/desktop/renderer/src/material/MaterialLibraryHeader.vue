<script setup lang="ts">
import { Ellipsis, Menu, Plus, Search } from "@lucide/vue";
import type { MaterialView } from "@desktop/types/material";

defineProps<{
  query: string;
  status: MaterialView["status"] | "";
  busy: boolean;
  apiReady: boolean;
}>();
defineEmits<{
  "update:query": [value: string];
  "update:status": [value: MaterialView["status"] | ""];
  toggleSidebar: [];
  importFiles: [];
  exportPackage: [];
  restorePackage: [];
  refresh: [];
}>();
</script>

<template>
  <header class="material-library-header window-drag">
    <div class="material-library-header-primary">
      <button
        class="material-sidebar-toggle icon-button no-drag"
        type="button"
        :aria-label="$t('打开侧栏')"
        :title="$t('打开侧栏')"
        @click="$emit('toggleSidebar')"
      >
        <Menu :size="17" aria-hidden="true" />
      </button>
      <h1>{{ $t('材料库') }}</h1>
      <div class="material-library-header-actions no-drag">
        <button
          class="primary-button icon-label"
          type="button"
          :disabled="busy || !apiReady"
          @click="$emit('importFiles')"
        >
          <Plus :size="15" aria-hidden="true" />{{ $t('导入材料') }}
        </button>
        <details class="material-more-actions">
          <summary class="icon-button" :aria-label="$t('更多材料操作')" :title="$t('更多材料操作')">
            <Ellipsis :size="16" aria-hidden="true" />
          </summary>
          <div class="material-more-menu" role="menu">
            <button type="button" role="menuitem" :disabled="busy || !apiReady" @click="$emit('restorePackage')">
              {{ $t('恢复备份') }}
            </button>
            <button type="button" role="menuitem" :disabled="busy || !apiReady" @click="$emit('exportPackage')">
              {{ $t('导出备份') }}
            </button>
          </div>
        </details>
      </div>
      <div class="window-controls-slot no-drag" aria-hidden="true" />
    </div>
    <div class="material-library-header-toolbar no-drag">
      <label class="material-library-search">
        <Search :size="15" aria-hidden="true" />
        <input
          :value="query"
          :placeholder="$t('搜索材料')"
          :aria-label="$t('搜索材料')"
          @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <div class="material-status-filter">
        <select
          :value="status"
          :aria-label="$t('按状态筛选')"
          @change="$emit('update:status', ($event.target as HTMLSelectElement).value as MaterialView['status'] | '')"
        >
          <option value="">{{ $t('全部状态') }}</option>
          <option value="unclassified">{{ $t('未归类') }}</option>
          <option value="needs_confirmation">{{ $t('待确认') }}</option>
          <option value="ready">{{ $t('已整理') }}</option>
          <option value="expired">{{ $t('OCR 已过期') }}</option>
          <option value="failed">{{ $t('处理失败') }}</option>
        </select>
      </div>
    </div>
  </header>
</template>

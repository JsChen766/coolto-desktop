<script setup lang="ts">
import { Ellipsis, Menu, Plus, RefreshCw, Search } from "@lucide/vue";
import type { MaterialView } from "@desktop/types/material";
import MaterialLibraryStatusFilter from "./MaterialLibraryStatusFilter.vue";

defineProps<{
  query: string;
  status: MaterialView["status"] | "";
  loading: boolean;
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
  clearFilters: [];
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
      <details class="material-more-actions no-drag">
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
      <div class="window-controls-slot no-drag" aria-hidden="true" />
    </div>
    <div class="material-library-header-toolbar no-drag">
      <button
        class="icon-button"
        type="button"
        :disabled="loading"
        :aria-label="$t('刷新材料列表')"
        :title="$t('刷新材料列表')"
        @click="$emit('refresh')"
      >
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
      </button>
      <label class="material-library-search">
        <Search :size="15" aria-hidden="true" />
        <input
          :value="query"
          :placeholder="$t('搜索材料')"
          :aria-label="$t('搜索材料')"
          @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <MaterialLibraryStatusFilter
        :status="status"
        @update:status="$emit('update:status', $event)"
        @clear="$emit('clearFilters')"
      />
      <button
        class="primary-button icon-label material-import-button"
        type="button"
        :disabled="busy || !apiReady"
        @click="$emit('importFiles')"
      >
        <Plus :size="15" aria-hidden="true" />{{ $t('导入材料') }}
      </button>
    </div>
  </header>
</template>

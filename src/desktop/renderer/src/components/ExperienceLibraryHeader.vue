<script setup lang="ts">
import { Menu, RefreshCw, Search } from "@lucide/vue";

import type { ExperienceCategory } from "@desktop/types";
import ExperienceFilterPopover from "./ExperienceFilterPopover.vue";

defineProps<{
  query: string;
  category: ExperienceCategory | "";
  status: "active" | "archived";
  tags: string[];
  availableTags: string[];
  filterCount: number;
  loading: boolean;
}>();
defineEmits<{
  "update:query": [value: string];
  "update:category": [value: ExperienceCategory | ""];
  "update:status": [value: "active" | "archived"];
  toggleTag: [tag: string];
  clearFilters: [];
  refresh: [];
  toggleSidebar: [];
}>();
</script>

<template>
  <header class="experience-header window-drag">
    <button
      class="experience-sidebar-toggle icon-button no-drag"
      type="button"
      aria-label="打开侧栏"
      title="打开侧栏"
      @click="$emit('toggleSidebar')"
    >
      <Menu :size="17" aria-hidden="true" />
    </button>
    <h1>经历仓库</h1>
    <div class="experience-header-tools no-drag">
      <label class="experience-search">
        <Search :size="15" aria-hidden="true" />
        <input
          :value="query"
          placeholder="搜索经历、组织、标签或正文"
          aria-label="搜索经历"
          @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <ExperienceFilterPopover
        :category="category"
        :status="status"
        :tags="tags"
        :available-tags="availableTags"
        :count="filterCount"
        @update:category="$emit('update:category', $event)"
        @update:status="$emit('update:status', $event)"
        @toggle-tag="$emit('toggleTag', $event)"
        @clear="$emit('clearFilters')"
      />
      <button
        class="experience-refresh icon-button"
        type="button"
        :disabled="loading"
        aria-label="刷新经历仓库"
        title="刷新经历仓库"
        @click="$emit('refresh')"
      >
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

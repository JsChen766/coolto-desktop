<script setup lang="ts">
import { CloudUpload, Menu, Plus, RefreshCw, Search } from "@lucide/vue";

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
  hasPending?: boolean;
  syncing?: boolean;
}>();
defineEmits<{
  "update:query": [value: string];
  "update:category": [value: ExperienceCategory | ""];
  "update:status": [value: "active" | "archived"];
  toggleTag: [tag: string];
  clearFilters: [];
  newExperience: [];
  refresh: [];
  syncAll: [];
  toggleSidebar: [];
}>();
</script>

<template>
  <header class="experience-header window-drag">
    <button
      class="experience-sidebar-toggle icon-button no-drag"
      type="button"
      :aria-label="$t('打开侧栏')"
      :title="$t('打开侧栏')"
      @click="$emit('toggleSidebar')"
    >
      <Menu :size="17" aria-hidden="true" />
    </button>
    <h1>{{ $t('经历仓库') }}</h1>
    <div class="experience-header-tools no-drag">
      <button
        class="primary-button icon-label experience-new-button"
        type="button"
        @click="$emit('newExperience')"
      >
        <Plus :size="16" :stroke-width="1.8" aria-hidden="true" />
        {{ $t('新建经历') }}
      </button>
      <label class="experience-search">
        <Search :size="15" aria-hidden="true" />
        <input
          :value="query"
          :placeholder="$t('搜索经历、组织、标签或正文')"
          :aria-label="$t('搜索经历')"
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
        v-if="hasPending"
        class="experience-refresh icon-button"
        type="button"
        :disabled="syncing"
        :aria-label="$t('同步全部')"
        :title="$t('同步全部')"
        @click="$emit('syncAll')"
      >
        <CloudUpload :size="16" :class="{ spin: syncing }" aria-hidden="true" />
      </button>
      <button
        class="experience-refresh icon-button"
        type="button"
        :disabled="loading"
        :aria-label="$t('刷新经历仓库')"
        :title="$t('刷新经历仓库')"
        @click="$emit('refresh')"
      >
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import {
  BriefcaseBusiness,
  ClipboardList,
  FileText,
  FileUp,
  Menu,
  RefreshCw,
  Search,
} from "@lucide/vue";

import type {
  JobFilter,
  RepositoryView,
  ResumeFilter,
} from "../job-assets/job-repository-filter";
import JobRepositoryFilter from "./JobRepositoryFilter.vue";
import SegmentPillNav from "./SegmentPillNav.vue";

const repositoryViews = [
  { key: "jobs", label: "岗位", icon: BriefcaseBusiness },
  { key: "resumes", label: "简历资产", icon: FileText },
] as const;

defineProps<{
  view: RepositoryView;
  query: string;
  jobFilter: JobFilter;
  resumeFilter: ResumeFilter;
  deliveryFileCount: number;
  loading: boolean;
}>();
defineEmits<{
  "update:view": [value: RepositoryView];
  "update:query": [value: string];
  "update:jobFilter": [value: JobFilter];
  "update:resumeFilter": [value: ResumeFilter];
  refresh: [];
  toggleSidebar: [];
  applications: [];
  importDelivery: [];
  clearFilters: [];
}>();
</script>

<template>
  <header class="repository-header window-drag">
    <div class="repository-header-primary">
      <button
        class="repository-sidebar-toggle icon-button no-drag"
        type="button"
        :aria-label="$t('打开侧栏')"
        :title="$t('打开侧栏')"
        @click="$emit('toggleSidebar')"
      >
        <Menu :size="17" aria-hidden="true" />
      </button>
      <div class="repository-heading"><h1>{{ $t('求职仓库') }}</h1></div>
      <SegmentPillNav
        class="repository-view-switcher no-drag"
        :model-value="view"
        :items="repositoryViews"
        layout-id="repository-view-pill"
        :aria-label="$t('求职仓库视角')"
        @update:model-value="$emit('update:view', $event as RepositoryView)"
      />
      <button
        v-if="view === 'resumes'"
        class="repository-primary-action primary-button icon-label no-drag"
        type="button"
        :disabled="deliveryFileCount >= 3"
        :title="deliveryFileCount >= 3 ? $t('最多保存 3 份原始简历') : $tf('添加原始简历（{count}/3）', { count: deliveryFileCount })"
        :aria-label="$tf('添加原始简历（{count}/3）', { count: deliveryFileCount })"
        @click="$emit('importDelivery')"
      >
        <FileUp :size="14" aria-hidden="true" />
        <span class="repository-primary-action-label">{{ $t('添加原始简历') }}</span>
      </button>
      <div class="window-controls-slot no-drag" aria-hidden="true" />
    </div>
    <div class="repository-header-toolbar no-drag">
      <label class="repository-search">
        <Search :size="15" aria-hidden="true" />
        <input
          :value="query"
          :placeholder="view === 'jobs' ? $t('搜索公司、岗位或 JD') : $t('搜索简历或目标岗位')"
          :aria-label="view === 'jobs' ? $t('搜索岗位') : $t('搜索简历')"
          @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <JobRepositoryFilter
        :view="view"
        :job-filter="jobFilter"
        :resume-filter="resumeFilter"
        @update:job-filter="$emit('update:jobFilter', $event)"
        @update:resume-filter="$emit('update:resumeFilter', $event)"
        @clear="$emit('clearFilters')"
      />
      <button
        class="repository-refresh icon-button"
        type="button"
        :disabled="loading"
        :aria-label="$t('刷新求职仓库')"
        :title="$t('刷新求职仓库')"
        @click="$emit('refresh')"
      >
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
      </button>
      <button
        class="repository-applications secondary-button icon-label"
        type="button"
        @click="$emit('applications')"
      >
        <ClipboardList :size="14" aria-hidden="true" />
        <span class="repository-applications-label">{{ $t('投递记录') }}</span>
      </button>
    </div>
  </header>
</template>

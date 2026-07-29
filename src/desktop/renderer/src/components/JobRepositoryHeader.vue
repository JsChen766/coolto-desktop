<script setup lang="ts">
import {
  BriefcaseBusiness,
  FileText,
  Menu,
  RefreshCw,
  Search,
} from "@lucide/vue";

import type {
  JobFilter,
  RepositoryView,
  ResumeFilter,
} from "../job-assets/job-repository-filter";

defineProps<{
  view: RepositoryView;
  query: string;
  jobFilter: JobFilter;
  resumeFilter: ResumeFilter;
  loading: boolean;
}>();
defineEmits<{
  "update:view": [value: RepositoryView];
  "update:query": [value: string];
  "update:jobFilter": [value: JobFilter];
  "update:resumeFilter": [value: ResumeFilter];
  refresh: [];
  toggleSidebar: [];
}>();
</script>

<template>
  <header class="repository-header window-drag">
    <button
      class="repository-sidebar-toggle icon-button no-drag"
      type="button"
      aria-label="打开侧栏"
      title="打开侧栏"
      @click="$emit('toggleSidebar')"
    >
      <Menu :size="17" aria-hidden="true" />
    </button>
    <div class="repository-heading"><h1>求职仓库</h1></div>
    <nav class="tracker-view-switcher no-drag" aria-label="求职仓库视角">
      <button
        type="button"
        :class="{ active: view === 'jobs' }"
        @click="$emit('update:view', 'jobs')"
      >
        <BriefcaseBusiness :size="14" aria-hidden="true" />岗位
      </button>
      <button
        type="button"
        :class="{ active: view === 'resumes' }"
        @click="$emit('update:view', 'resumes')"
      >
        <FileText :size="14" aria-hidden="true" />简历
      </button>
    </nav>
    <div class="repository-tools no-drag">
      <label class="repository-search">
        <Search :size="15" aria-hidden="true" />
        <input
          :value="query"
          :placeholder="view === 'jobs' ? '搜索公司、岗位或 JD' : '搜索简历或目标岗位'"
          :aria-label="view === 'jobs' ? '搜索岗位' : '搜索简历'"
          @input="$emit('update:query', ($event.target as HTMLInputElement).value)"
        />
      </label>
      <select
        v-if="view === 'jobs'"
        :value="jobFilter"
        aria-label="筛选岗位"
        @change="$emit('update:jobFilter', ($event.target as HTMLSelectElement).value as JobFilter)"
      >
        <option value="">全部岗位</option>
        <option value="with_resumes">有简历</option>
        <option value="without_resumes">无简历</option>
        <option value="applied">已有投递</option>
        <option value="conflict">同步冲突</option>
      </select>
      <select
        v-else
        :value="resumeFilter"
        aria-label="筛选简历"
        @change="$emit('update:resumeFilter', ($event.target as HTMLSelectElement).value as ResumeFilter)"
      >
        <option value="">全部简历</option>
        <option value="targeted">针对性</option>
        <option value="generic">通用</option>
        <option value="archived">归档</option>
        <option value="local_only">仅本机</option>
        <option value="conflict">同步冲突</option>
      </select>
      <button
        class="repository-refresh icon-button"
        type="button"
        :disabled="loading"
        aria-label="刷新求职仓库"
        title="刷新求职仓库"
        @click="$emit('refresh')"
      >
        <RefreshCw :size="16" :class="{ spin: loading }" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

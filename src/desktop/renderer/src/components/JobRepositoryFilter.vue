<script setup lang="ts">
import { SlidersHorizontal, X } from "@lucide/vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { JobFilter, RepositoryView, ResumeFilter } from "../job-assets/job-repository-filter";

const props = defineProps<{
  view: RepositoryView;
  jobFilter: JobFilter;
  resumeFilter: ResumeFilter;
}>();
const emit = defineEmits<{
  "update:jobFilter": [value: JobFilter];
  "update:resumeFilter": [value: ResumeFilter];
  clear: [];
}>();

const open = ref(false);
const root = ref<HTMLElement>();
const count = computed(() => (props.view === "jobs" ? props.jobFilter : props.resumeFilter) ? 1 : 0);

function closeOutside(event: MouseEvent): void {
  if (!root.value?.contains(event.target as Node)) open.value = false;
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") open.value = false;
}

onMounted(() => {
  window.addEventListener("click", closeOutside);
  window.addEventListener("keydown", closeOnEscape);
});
onBeforeUnmount(() => {
  window.removeEventListener("click", closeOutside);
  window.removeEventListener("keydown", closeOnEscape);
});
</script>

<template>
  <div ref="root" class="repository-filter">
    <button
      class="repository-filter-trigger"
      type="button"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click.stop="open = !open"
    >
      <SlidersHorizontal :size="15" aria-hidden="true" />
      {{ $t('筛选') }}
      <span v-if="count">{{ count }}</span>
    </button>
    <div
      v-if="open"
      class="popover repository-filter-popover"
      role="dialog"
      :aria-label="view === 'jobs' ? $t('筛选岗位') : $t('筛选简历')"
      @click.stop
    >
      <div class="repository-filter-heading">
        <strong>{{ view === 'jobs' ? $t('筛选岗位') : $t('筛选简历') }}</strong>
        <button type="button" :aria-label="$t('关闭筛选')" @click="open = false">
          <X :size="15" aria-hidden="true" />
        </button>
      </div>
      <label v-if="view === 'jobs'">
        <span>{{ $t('范围') }}</span>
        <select
          :value="jobFilter"
          @change="$emit('update:jobFilter', ($event.target as HTMLSelectElement).value as JobFilter)"
        >
          <option value="">{{ $t('全部岗位') }}</option>
          <option value="with_resumes">{{ $t('有简历') }}</option>
          <option value="without_resumes">{{ $t('无简历') }}</option>
          <option value="applied">{{ $t('已有投递') }}</option>
          <option value="conflict">{{ $t('同步冲突') }}</option>
        </select>
      </label>
      <label v-else>
        <span>{{ $t('范围') }}</span>
        <select
          :value="resumeFilter"
          @change="$emit('update:resumeFilter', ($event.target as HTMLSelectElement).value as ResumeFilter)"
        >
          <option value="">{{ $t('全部简历') }}</option>
          <option value="targeted">{{ $t('针对性') }}</option>
          <option value="generic">{{ $t('通用') }}</option>
          <option value="user_original">{{ $t('原始简历') }}</option>
          <option value="archived">{{ $t('归档') }}</option>
          <option value="conflict">{{ $t('同步冲突') }}</option>
        </select>
      </label>
      <button
        v-if="count"
        class="secondary-button repository-filter-clear"
        type="button"
        @click="$emit('clear'); open = false"
      >
        {{ $t('清除筛选') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BriefcaseBusiness, FileText } from "@lucide/vue";

import type { RepositoryView } from "../job-assets/job-repository-filter";

defineProps<{
  variant: "global" | RepositoryView | "filter";
  view?: RepositoryView;
}>();
defineEmits<{
  openChat: [];
  importDelivery: [];
  clearFilters: [];
}>();
</script>

<template>
  <div class="repository-page-state repository-empty-state">
    <template v-if="variant === 'global'">
      <BriefcaseBusiness :size="23" aria-hidden="true" />
      <strong>{{ $t('尚无 JD 和 Resume') }}</strong>
      <p>{{ $t('在对话里粘贴 JD 或生成简历后，会出现在这里。') }}</p>
      <button class="primary-button" type="button" @click="$emit('openChat')">
        {{ $t('回到对话') }}
      </button>
    </template>
    <template v-else-if="variant === 'jobs'">
      <BriefcaseBusiness :size="23" aria-hidden="true" />
      <strong>{{ $t('还没有岗位') }}</strong>
      <p>{{ $t('在对话里粘贴 JD，确认保存后再回到这里查看。') }}</p>
      <button class="primary-button" type="button" @click="$emit('openChat')">
        {{ $t('回到对话') }}
      </button>
    </template>
    <template v-else-if="variant === 'resumes'">
      <FileText :size="23" aria-hidden="true" />
      <strong>{{ $t('还没有简历') }}</strong>
      <p>{{ $t('可从对话生成简历，或先添加最多 3 份本机原始简历。') }}</p>
      <div class="repository-empty-actions">
        <button class="primary-button" type="button" @click="$emit('importDelivery')">
          {{ $t('添加原始简历') }}
        </button>
        <button class="secondary-button" type="button" @click="$emit('openChat')">
          {{ $t('回到对话') }}
        </button>
      </div>
    </template>
    <template v-else>
      <strong>
        {{ view === 'jobs'
          ? $t('没有符合当前搜索或筛选条件的岗位')
          : $t('没有符合当前搜索或筛选条件的简历') }}
      </strong>
      <button class="secondary-button" type="button" @click="$emit('clearFilters')">
        {{ $t('清除筛选') }}
      </button>
    </template>
  </div>
</template>

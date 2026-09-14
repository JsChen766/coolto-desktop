<script setup lang="ts">
import { Archive } from "@lucide/vue";

defineProps<{ variant: "empty" | "filter" }>();
defineEmits<{ importFiles: []; clearFilters: [] }>();
</script>

<template>
  <div class="material-page-state">
    <template v-if="variant === 'empty'">
      <Archive :size="23" aria-hidden="true" />
      <strong>{{ $t('还没有材料') }}</strong>
      <p>{{ $t('选择 PDF、DOCX、TXT、MD、PNG 或 JPG，材料只保存在本机。') }}</p>
      <button class="primary-button" type="button" @click="$emit('importFiles')">
        {{ $t('导入材料') }}
      </button>
    </template>
    <template v-else>
      <strong>{{ $t('没有符合当前搜索或筛选条件的材料') }}</strong>
      <button class="secondary-button" type="button" @click="$emit('clearFilters')">
        {{ $t('清除筛选') }}
      </button>
    </template>
  </div>
</template>

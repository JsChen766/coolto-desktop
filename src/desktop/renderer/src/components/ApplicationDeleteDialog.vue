<script setup lang="ts">
import type { ApplicationRecord } from "@desktop/types";

defineProps<{
  application: ApplicationRecord;
  busy?: boolean;
  error?: string | undefined;
  childCounts?: { interviews: number; notes: number; reminders: number } | undefined;
}>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section class="dialog-card" role="dialog" aria-modal="true" :aria-label="$t('删除投递记录')">
      <h2>{{ $t('删除这条投递记录？') }}</h2>
      <p>
        {{ $tf('“{company} · {role}”会从当前设备移除并等待同步删除；关联的 JD 和简历不会被删除。', {
          company: application.companyName, role: application.roleName,
        }) }}
      </p>
      <p v-if="childCounts && (childCounts.interviews || childCounts.notes || childCounts.reminders)">
        {{ $tf('同时删除 {interviews} 场面试、{notes} 条笔记和 {reminders} 个提醒；本机将立即停止这些提醒。', childCounts) }}
      </p>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">
          {{ $t('取消') }}
        </button>
        <button class="primary-button danger" type="button" :disabled="busy" @click="$emit('confirm')">
          {{ busy ? $t('正在删除…') : $t('删除记录') }}
        </button>
      </div>
    </section>
  </div>
</template>

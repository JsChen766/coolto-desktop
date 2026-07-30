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
    <section class="dialog-card" role="dialog" aria-modal="true" aria-label="删除投递记录">
      <h2>删除这条投递记录？</h2>
      <p>
        “{{ application.companyName }} · {{ application.roleName }}”会从当前设备移除并等待同步删除；
        关联的 JD 和简历不会被删除。
      </p>
      <p v-if="childCounts && (childCounts.interviews || childCounts.notes || childCounts.reminders)">
        同时删除 {{ childCounts.interviews }} 场面试、{{ childCounts.notes }} 条笔记和
        {{ childCounts.reminders }} 个提醒；本机将立即停止这些提醒。
      </p>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">
          取消
        </button>
        <button class="primary-button danger" type="button" :disabled="busy" @click="$emit('confirm')">
          {{ busy ? "正在删除…" : "删除记录" }}
        </button>
      </div>
    </section>
  </div>
</template>

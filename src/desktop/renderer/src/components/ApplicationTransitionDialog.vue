<script setup lang="ts">
import { computed, ref } from "vue";

import type { ApplicationRecord, ApplicationStatus } from "@desktop/types";
import { STATUS_LABELS, transitionLabel } from "../tracker/application-labels";

const props = defineProps<{
  application: ApplicationRecord;
  target: ApplicationStatus;
  busy?: boolean;
  error?: string | undefined;
}>();

const emit = defineEmits<{
  close: [];
  confirm: [reason: string | null];
}>();

const reason = ref("");
const sameInterviewStage = computed(
  () => props.application.status === "interviewing" && props.target === "interviewing",
);
const valid = computed(() => !sameInterviewStage.value || Boolean(reason.value.trim()));
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <form
      class="dialog-card tracker-transition-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="确认投递状态"
      @submit.prevent="$emit('confirm', reason.trim() || null)"
    >
      <h2>{{ transitionLabel(application.status, target) }}？</h2>
      <p>
        “{{ application.companyName }} · {{ application.roleName }}”将从
        {{ STATUS_LABELS[application.status] }}更新为 {{ STATUS_LABELS[target] }}。
      </p>
      <label class="tracker-dialog-field">
        <span>{{ sameInterviewStage ? "下一轮说明（必填）" : "说明（可选）" }}</span>
        <textarea
          v-model="reason"
          rows="3"
          maxlength="20000"
          :placeholder="sameInterviewStage ? '例如：进入第二轮技术面试' : '记录联系人反馈或状态来源'"
        />
      </label>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">
          取消
        </button>
        <button class="primary-button" type="submit" :disabled="busy || !valid">
          {{ busy ? "正在更新…" : "确认更新" }}
        </button>
      </div>
    </form>
  </div>
</template>

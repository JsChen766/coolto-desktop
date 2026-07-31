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
      :aria-label="$t('确认投递状态')"
      @submit.prevent="$emit('confirm', reason.trim() || null)"
    >
      <h2>{{ transitionLabel(application.status, target) }}？</h2>
      <p>
        {{ $tf('“{company} · {role}”将从 {from} 更新为 {to}。', {
          company: application.companyName, role: application.roleName,
          from: STATUS_LABELS[application.status], to: STATUS_LABELS[target],
        }) }}
      </p>
      <label class="tracker-dialog-field">
        <span>{{ sameInterviewStage ? $t('下一轮说明（必填）') : $t('说明（可选）') }}</span>
        <textarea
          v-model="reason"
          rows="3"
          maxlength="20000"
          :placeholder="sameInterviewStage ? $t('例如：进入第二轮技术面试') : $t('记录联系人反馈或状态来源')"
        />
      </label>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">
          {{ $t('取消') }}
        </button>
        <button class="primary-button" type="submit" :disabled="busy || !valid">
          {{ busy ? $t('正在更新…') : $t('确认更新') }}
        </button>
      </div>
    </form>
  </div>
</template>

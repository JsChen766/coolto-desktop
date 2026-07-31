<script setup lang="ts">
import { reactive } from "vue";
import type { InterviewRound, Reminder, ReminderInput } from "@desktop/types";
import { isoFromLocal, localDateTime, REMINDER_STATUS_LABELS } from "../tracker/tracker-child-labels";

const props = defineProps<{ reminder?: Reminder | undefined; interviews: InterviewRound[]; busy?: boolean; error?: string | undefined }>();
const emit = defineEmits<{ close: []; review: [value: ReminderInput] }>();
const form = reactive({
  interviewRoundId: props.reminder?.interviewRoundId ?? "", title: props.reminder?.title ?? "",
  remindAt: localDateTime(props.reminder?.remindAt ?? new Date(Date.now() + 3_600_000).toISOString()),
  status: props.reminder?.status ?? "scheduled",
});
function review(): void {
  emit("review", { interviewRoundId: form.interviewRoundId || null, title: form.title,
    remindAt: isoFromLocal(form.remindAt)!, status: form.status,
    deliveredAt: form.status === "delivered" ? new Date().toISOString() : null });
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <form class="dialog-card tracker-child-editor" role="dialog" aria-modal="true" @submit.prevent="review">
      <h2>{{ reminder ? $t('修改提醒') : $t('添加单次提醒') }}</h2>
      <div class="tracker-child-grid">
        <label class="wide"><span>{{ $t('提醒内容') }}</span><input v-model="form.title" maxlength="240" required /></label>
        <label class="wide"><span>{{ $t('提醒时间（本机时区）') }}</span><input v-model="form.remindAt" type="datetime-local" required /></label>
        <label><span>{{ $t('关联面试') }}</span><select v-model="form.interviewRoundId"><option value="">{{ $t('不关联') }}</option><option v-for="item in interviews" :key="item.id" :value="item.id">{{ $tf('第 {round} 轮', { round: item.roundNumber }) }}</option></select></label>
        <label><span>{{ $t('状态') }}</span><select v-model="form.status"><option v-for="(label, value) in REMINDER_STATUS_LABELS" :key="value" :value="value">{{ label }}</option></select></label>
      </div>
      <p class="tracker-child-hint">{{ $t('这是单次提醒；关闭应用期间最多补发 24 小时内错过的提醒。') }}</p>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions"><button class="secondary-button" type="button" @click="$emit('close')">{{ $t('取消') }}</button><button class="primary-button" :disabled="busy">{{ $t('检查并继续') }}</button></div>
    </form>
  </div>
</template>

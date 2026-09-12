<script setup lang="ts">
import { reactive } from "vue";
import type { InterviewInput, InterviewRound } from "@desktop/types";
import DialogSelect from "./DialogSelect.vue";
import { recordToSelectOptions } from "./dialog-select-options";
import { INTERVIEW_STATUS_LABELS, INTERVIEW_TYPE_LABELS, isoFromLocal, localDateTime } from "../tracker/tracker-child-labels";

const props = defineProps<{ interview?: InterviewRound | undefined; nextRound: number; busy?: boolean; error?: string | undefined }>();
const emit = defineEmits<{ close: []; review: [value: InterviewInput] }>();
const interviewTypeOptions = recordToSelectOptions(INTERVIEW_TYPE_LABELS);
const interviewStatusOptions = recordToSelectOptions(INTERVIEW_STATUS_LABELS);
const form = reactive({
  roundNumber: props.interview?.roundNumber ?? props.nextRound,
  interviewType: props.interview?.interviewType ?? "video",
  scheduledAt: localDateTime(props.interview?.scheduledAt),
  timezone: props.interview?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  durationMinutes: props.interview?.durationMinutes?.toString() ?? "60",
  locationOrLink: props.interview?.locationOrLink ?? "",
  interviewer: props.interview?.interviewer ?? "",
  status: props.interview?.status ?? "scheduled",
});

function review(): void {
  emit("review", {
    roundNumber: Number(form.roundNumber), interviewType: form.interviewType,
    scheduledAt: isoFromLocal(form.scheduledAt), timezone: form.timezone,
    durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : null,
    locationOrLink: form.locationOrLink || null, interviewer: form.interviewer || null,
    status: form.status,
  });
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <form class="dialog-card tracker-child-editor" role="dialog" aria-modal="true" @submit.prevent="review">
      <h2>{{ interview ? $t('修改面试') : $t('安排面试') }}</h2>
      <div class="tracker-child-grid">
        <label><span>{{ $t('轮次') }}</span><input v-model.number="form.roundNumber" type="number" min="1" required /></label>
        <label><span>{{ $t('类型') }}</span><DialogSelect v-model="form.interviewType" :options="interviewTypeOptions" /></label>
        <label class="wide"><span>{{ $tf('时间（{timezone}）', { timezone: form.timezone }) }}</span><input v-model="form.scheduledAt" type="datetime-local" /></label>
        <label><span>{{ $t('时长（分钟）') }}</span><input v-model="form.durationMinutes" type="number" min="1" max="1440" /></label>
        <label><span>{{ $t('状态') }}</span><DialogSelect v-model="form.status" :options="interviewStatusOptions" /></label>
        <label class="wide"><span>{{ $t('地点或链接') }}</span><input v-model="form.locationOrLink" maxlength="4096" /></label>
        <label class="wide"><span>{{ $t('面试官') }}</span><input v-model="form.interviewer" maxlength="240" /></label>
      </div>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions"><button class="secondary-button" type="button" @click="$emit('close')">{{ $t('取消') }}</button><button class="primary-button" :disabled="busy">{{ $t('检查并继续') }}</button></div>
    </form>
  </div>
</template>

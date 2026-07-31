<script setup lang="ts">
import { reactive } from "vue";
import type { ApplicationNote, InterviewRound, NoteInput } from "@desktop/types";
import { NOTE_TYPE_LABELS } from "../tracker/tracker-child-labels";

const props = defineProps<{ note?: ApplicationNote | undefined; interviews: InterviewRound[]; busy?: boolean; error?: string | undefined }>();
defineEmits<{ close: []; review: [value: NoteInput] }>();
const form = reactive({ interviewRoundId: props.note?.interviewRoundId ?? "", noteType: props.note?.noteType ?? "general", content: props.note?.content ?? "" });
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <form class="dialog-card tracker-child-editor" role="dialog" aria-modal="true" @submit.prevent="$emit('review', { interviewRoundId: form.interviewRoundId || null, noteType: form.noteType, content: form.content })">
      <h2>{{ note ? $t('修改笔记') : $t('添加笔记') }}</h2>
      <div class="tracker-child-grid">
        <label><span>{{ $t('类型') }}</span><select v-model="form.noteType"><option v-for="(label, value) in NOTE_TYPE_LABELS" :key="value" :value="value">{{ label }}</option></select></label>
        <label><span>{{ $t('关联面试') }}</span><select v-model="form.interviewRoundId"><option value="">{{ $t('不关联') }}</option><option v-for="item in interviews" :key="item.id" :value="item.id">{{ $tf('第 {round} 轮', { round: item.roundNumber }) }}</option></select></label>
        <label class="wide"><span>{{ $t('正文') }}</span><textarea v-model="form.content" rows="8" maxlength="50000" required /></label>
      </div>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions"><button class="secondary-button" type="button" @click="$emit('close')">{{ $t('取消') }}</button><button class="primary-button" :disabled="busy">{{ $t('检查并继续') }}</button></div>
    </form>
  </div>
</template>

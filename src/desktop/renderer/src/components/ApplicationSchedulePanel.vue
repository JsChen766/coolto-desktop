<script setup lang="ts">
import { Bell, CalendarClock, Pencil, Plus, Trash2 } from "@lucide/vue";
import type { InterviewRound, Reminder } from "@desktop/types";
import { INTERVIEW_STATUS_LABELS, INTERVIEW_TYPE_LABELS, REMINDER_STATUS_LABELS } from "../tracker/tracker-child-labels";

defineProps<{ interviews: InterviewRound[]; reminders: Reminder[]; busy?: boolean }>();
defineEmits<{
  addInterview: []; editInterview: [value: InterviewRound];
  addReminder: []; editReminder: [value: Reminder];
  remove: [kind: "interview" | "reminder", id: string];
}>();

function timeLabel(value: string | null): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "时间待定";
}
</script>

<template>
  <div class="tracker-child-sections">
    <section class="tracker-child-section">
      <header><div><CalendarClock :size="16" aria-hidden="true" /><strong>面试</strong><span>{{ interviews.length }}</span></div><button type="button" :disabled="busy" @click="$emit('addInterview')"><Plus :size="14" />安排面试</button></header>
      <div v-if="interviews.length" class="tracker-child-list">
        <article v-for="item in interviews" :key="item.id" class="tracker-child-item">
          <div><strong>第 {{ item.roundNumber }} 轮 · {{ INTERVIEW_TYPE_LABELS[item.interviewType] }}</strong><span>{{ INTERVIEW_STATUS_LABELS[item.status] }} · {{ timeLabel(item.scheduledAt) }}</span><small>{{ [item.interviewer, item.locationOrLink].filter(Boolean).join(' · ') || '暂无面试官或地点信息' }}</small></div>
          <nav><button type="button" aria-label="修改面试" @click="$emit('editInterview', item)"><Pencil :size="14" /></button><button type="button" aria-label="删除面试" @click="$emit('remove', 'interview', item.id)"><Trash2 :size="14" /></button></nav>
        </article>
      </div>
      <p v-else class="tracker-child-empty">尚未安排面试。</p>
    </section>
    <section class="tracker-child-section">
      <header><div><Bell :size="16" aria-hidden="true" /><strong>提醒</strong><span>{{ reminders.length }}</span></div><button type="button" :disabled="busy" @click="$emit('addReminder')"><Plus :size="14" />添加提醒</button></header>
      <div v-if="reminders.length" class="tracker-child-list">
        <article v-for="item in reminders" :key="item.id" class="tracker-child-item" :class="{ overdue: item.status === 'scheduled' && Date.parse(item.remindAt) < Date.now() }">
          <div><strong>{{ item.title }}</strong><span>{{ REMINDER_STATUS_LABELS[item.status] }} · {{ timeLabel(item.remindAt) }}</span><small v-if="item.status === 'scheduled' && Date.parse(item.remindAt) < Date.now()">已错过</small></div>
          <nav><button type="button" aria-label="修改提醒" @click="$emit('editReminder', item)"><Pencil :size="14" /></button><button type="button" aria-label="删除提醒" @click="$emit('remove', 'reminder', item.id)"><Trash2 :size="14" /></button></nav>
        </article>
      </div>
      <p v-else class="tracker-child-empty">尚未设置提醒。</p>
    </section>
  </div>
</template>


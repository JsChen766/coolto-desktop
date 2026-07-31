<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "@lucide/vue";
import { computed, ref } from "vue";

import type { ApplicationRecord, InterviewRound, Reminder } from "@desktop/types";
import { applicationStage } from "../tracker/application-board";
import {
  buildApplicationCalendar,
  CALENDAR_WEEKDAYS,
  initialCalendarAnchor,
  shiftCalendarMonth,
} from "../tracker/application-calendar";
import { STATUS_LABELS } from "../tracker/application-labels";

const props = defineProps<{ applications: ApplicationRecord[]; interviews: InterviewRound[]; reminders: Reminder[] }>();
defineEmits<{ open: [application: ApplicationRecord] }>();

const anchor = ref(initialCalendarAnchor(props.applications));
const calendar = computed(() => buildApplicationCalendar(anchor.value, props.applications));

function shift(offset: number): void {
  anchor.value = shiftCalendarMonth(anchor.value, offset);
}

function today(): void {
  anchor.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
}

function dateKey(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function application(id: string): ApplicationRecord | undefined {
  return props.applications.find((item) => item.id === id);
}
</script>

<template>
  <section class="tracker-calendar" :aria-label="$t('投递日历')">
    <header class="calendar-toolbar">
      <div>
        <strong>{{ calendar.label }}</strong>
        <span>{{ $t('投递、面试与单次提醒') }}</span>
      </div>
      <nav :aria-label="$t('切换月份')">
        <button type="button" :aria-label="$t('上个月')" @click="shift(-1)">
          <ChevronLeft :size="15" aria-hidden="true" />
        </button>
        <button type="button" @click="today">{{ $t('今天') }}</button>
        <button type="button" :aria-label="$t('下个月')" @click="shift(1)">
          <ChevronRight :size="15" aria-hidden="true" />
        </button>
      </nav>
    </header>
    <div class="calendar-grid calendar-weekdays" aria-hidden="true">
      <span v-for="weekday in CALENDAR_WEEKDAYS" :key="weekday">{{ $t(weekday) }}</span>
    </div>
    <div class="calendar-grid calendar-days">
      <section
        v-for="day in calendar.days"
        :key="day.dateKey"
        class="calendar-day"
        :class="{ outside: !day.inMonth, today: day.isToday }"
        :aria-label="day.dateKey"
      >
        <time :datetime="day.dateKey">{{ day.dayNumber }}</time>
        <div class="calendar-events">
          <button
            v-for="application in day.applications"
            :key="application.id"
            type="button"
            :class="`stage-${applicationStage(application.status)}`"
            :title="`${application.companyName} · ${application.roleName} · ${STATUS_LABELS[application.status]}`"
            @click="$emit('open', application)"
          >
            <i aria-hidden="true" />
            <span>{{ application.companyName }}</span>
            <small>{{ STATUS_LABELS[application.status] }}</small>
          </button>
          <button
            v-for="item in interviews.filter(value => value.scheduledAt && dateKey(value.scheduledAt) === day.dateKey)"
            :key="item.id"
            type="button"
            class="calendar-child-event interview"
            @click="application(item.applicationId) && $emit('open', application(item.applicationId)!)"
          ><i aria-hidden="true" /><span>{{ $tf('第 {round} 轮面试', { round: item.roundNumber }) }}</span><small>{{ new Date(item.scheduledAt!).toLocaleTimeString($locale(), { hour: '2-digit', minute: '2-digit' }) }}</small></button>
          <button
            v-for="item in reminders.filter(value => dateKey(value.remindAt) === day.dateKey)"
            :key="item.id"
            type="button"
            class="calendar-child-event reminder"
            @click="application(item.applicationId) && $emit('open', application(item.applicationId)!)"
          ><i aria-hidden="true" /><span>{{ item.title }}</span><small>{{ new Date(item.remindAt).toLocaleTimeString($locale(), { hour: '2-digit', minute: '2-digit' }) }}</small></button>
        </div>
      </section>
    </div>
  </section>
</template>

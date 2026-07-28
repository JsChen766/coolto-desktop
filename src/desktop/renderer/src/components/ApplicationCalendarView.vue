<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "@lucide/vue";
import { computed, ref } from "vue";

import type { ApplicationRecord } from "@desktop/types";
import { applicationStage } from "../tracker/application-board";
import {
  buildApplicationCalendar,
  CALENDAR_WEEKDAYS,
  initialCalendarAnchor,
  shiftCalendarMonth,
} from "../tracker/application-calendar";
import { STATUS_LABELS } from "../tracker/application-labels";

const props = defineProps<{ applications: ApplicationRecord[] }>();
defineEmits<{ open: [application: ApplicationRecord] }>();

const anchor = ref(initialCalendarAnchor(props.applications));
const calendar = computed(() => buildApplicationCalendar(anchor.value, props.applications));

function shift(offset: number): void {
  anchor.value = shiftCalendarMonth(anchor.value, offset);
}

function today(): void {
  anchor.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
}
</script>

<template>
  <section class="tracker-calendar" aria-label="投递日历">
    <header class="calendar-toolbar">
      <div>
        <strong>{{ calendar.label }}</strong>
        <span>按真实投递日期展示</span>
      </div>
      <nav aria-label="切换月份">
        <button type="button" aria-label="上个月" @click="shift(-1)">
          <ChevronLeft :size="15" aria-hidden="true" />
        </button>
        <button type="button" @click="today">今天</button>
        <button type="button" aria-label="下个月" @click="shift(1)">
          <ChevronRight :size="15" aria-hidden="true" />
        </button>
      </nav>
    </header>
    <div class="calendar-grid calendar-weekdays" aria-hidden="true">
      <span v-for="weekday in CALENDAR_WEEKDAYS" :key="weekday">{{ weekday }}</span>
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
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  ApplicationRecord,
  ApplicationStatus,
  ApplicationStatusEvent,
  InterviewRound,
  Reminder,
} from "@desktop/types";
import {
  APPLICATION_BOARD_COLUMNS,
  type TrackerViewMode,
} from "../tracker/application-board";
import { TRACKER_VIEW_ORDER } from "../motion/segment-view-motion";
import ApplicationBoardColumn from "./ApplicationBoardColumn.vue";
import ApplicationCalendarView from "./ApplicationCalendarView.vue";
import ApplicationTimelineView from "./ApplicationTimelineView.vue";
import SegmentViewTransition from "./SegmentViewTransition.vue";

defineProps<{
  activeView: TrackerViewMode;
  loading: boolean;
  busy: boolean;
  hasApplications: boolean;
  filtered: ApplicationRecord[];
  interviews: InterviewRound[];
  reminders: Reminder[];
  events: ApplicationStatusEvent[];
  applicationsFor: (statuses: readonly ApplicationStatus[]) => ApplicationRecord[];
}>();
defineEmits<{
  open: [application: ApplicationRecord];
  transition: [application: ApplicationRecord, status: ApplicationStatus];
}>();
</script>

<template>
  <div v-if="loading && !hasApplications" class="tracker-loading">
    {{ $t('正在读取本地投递记录…') }}
  </div>
  <SegmentViewTransition
    v-else
    :view-key="activeView"
    :order="TRACKER_VIEW_ORDER"
  >
    <div v-if="activeView === 'board'" class="tracker-board">
      <ApplicationBoardColumn
        v-for="column in APPLICATION_BOARD_COLUMNS"
        :key="column.key"
        :title="$t(column.title)"
        :description="$t(column.description)"
        :applications="applicationsFor(column.statuses)"
        :busy="busy"
        :interviews="interviews"
        :reminders="reminders"
        @open="$emit('open', $event)"
        @transition="(application, status) => $emit('transition', application, status)"
      />
    </div>
    <ApplicationTimelineView
      v-else-if="activeView === 'timeline'"
      :applications="filtered"
      :events="events"
      :interviews="interviews"
      @open="$emit('open', $event)"
    />
    <ApplicationCalendarView
      v-else
      :applications="filtered"
      :interviews="interviews"
      :reminders="reminders"
      @open="$emit('open', $event)"
    />
  </SegmentViewTransition>
</template>

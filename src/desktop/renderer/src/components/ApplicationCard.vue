<script setup lang="ts">
import { Bell, CalendarClock, FileText, Link2 } from "@lucide/vue";
import { computed } from "vue";

import type { ApplicationRecord, ApplicationStatus, InterviewRound, Reminder } from "@desktop/types";
import { STATUS_LABELS, syncLabel } from "../tracker/application-labels";
import { applicationStage } from "../tracker/application-board";
import { localeCode, translate } from "../i18n/locale";
import ApplicationStatusMenu from "./ApplicationStatusMenu.vue";

const props = defineProps<{
  application: ApplicationRecord;
  interviews: InterviewRound[];
  reminders: Reminder[];
  busy?: boolean;
}>();
const nextInterview = computed(() => props.interviews
  .filter((item) => item.status === "scheduled" && item.scheduledAt)
  .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))[0]);
const nextReminder = computed(() => props.reminders
  .filter((item) => item.status === "scheduled")
  .sort((a, b) => a.remindAt.localeCompare(b.remindAt))[0]);

defineEmits<{
  open: [];
  transition: [status: ApplicationStatus];
}>();

function dateLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(localeCode(), { month: "numeric", day: "numeric" }).format(new Date(value))
    : translate("待确认");
}
</script>

<template>
  <article
    class="tracker-card"
    :class="`stage-${applicationStage(application.status)}`"
  >
    <button class="tracker-card-open" type="button" @click="$emit('open')">
      <div class="tracker-card-heading">
        <div>
          <strong>{{ application.companyName }}</strong>
          <span>{{ application.roleName }}</span>
        </div>
        <span class="tracker-exact-status" :class="`status-${application.status}`">
          {{ STATUS_LABELS[application.status] }}
        </span>
      </div>
      <div v-if="nextInterview || nextReminder" class="tracker-card-schedule">
      <span v-if="nextInterview"><CalendarClock :size="12" />{{ $tf('第 {round} 轮', { round: nextInterview.roundNumber }) }} · {{ dateLabel(nextInterview.scheduledAt) }}</span>
        <span v-if="nextReminder"><Bell :size="12" />{{ nextReminder.title }} · {{ dateLabel(nextReminder.remindAt) }}</span>
      </div>
      <div class="tracker-card-meta">
        <span>{{ dateLabel(application.appliedAt) }}</span>
        <span class="tracker-sync-state" :class="application.syncStatus">
          {{ syncLabel(application.syncStatus) }}
        </span>
      </div>
      <div
        v-if="application.jdTitleSnapshot || application.resumeTitleSnapshot"
        class="tracker-card-refs"
      >
        <span v-if="application.jdTitleSnapshot">
          <Link2 :size="12" aria-hidden="true" />{{ application.jdTitleSnapshot }}
        </span>
        <span v-if="application.resumeTitleSnapshot">
          <FileText :size="12" aria-hidden="true" />{{ application.resumeTitleSnapshot }}
        </span>
      </div>
    </button>
    <footer class="tracker-card-actions">
      <ApplicationStatusMenu
        :status="application.status"
        :disabled="busy"
        compact
        @select="$emit('transition', $event)"
      />
    </footer>
  </article>
</template>

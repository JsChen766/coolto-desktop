<script setup lang="ts">
import { computed } from "vue";

import type { ApplicationRecord, ApplicationStatusEvent, InterviewRound } from "@desktop/types";
import {
  APPLICATION_BOARD_COLUMNS,
  applicationStage,
  applicationStageIndex,
} from "../tracker/application-board";
import { STATUS_LABELS } from "../tracker/application-labels";
import { localeCode, translate, translateFormat } from "../i18n/locale";

const props = defineProps<{ applications: ApplicationRecord[]; events: ApplicationStatusEvent[]; interviews: InterviewRound[] }>();
defineEmits<{ open: [application: ApplicationRecord] }>();

const entries = computed(() => [...props.applications]
  .sort((left, right) => (right.appliedAt ?? right.createdAt).localeCompare(left.appliedAt ?? left.createdAt))
  .map((application) => ({
    application,
    stage: applicationStage(application.status),
    stageIndex: applicationStageIndex(application.status),
  })));

function activity(applicationId: string): string {
  const transitions = props.events.filter((item) => item.applicationId === applicationId).length;
  const interviews = props.interviews.filter((item) => item.applicationId === applicationId).length;
  return translateFormat("{transitions} 次状态变化 · {interviews} 场面试", {
    transitions,
    interviews,
  });
}

function dateLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(localeCode(), { month: "numeric", day: "numeric" }).format(new Date(value))
    : translate("待确认");
}
</script>

<template>
  <section class="tracker-timeline" :aria-label="$t('投递阶段时间轴')">
    <header class="timeline-header">
      <span>{{ $t('投递时间') }}</span>
      <span>{{ $t('公司与岗位') }}</span>
      <div class="timeline-stage-headings">
        <span v-for="column in APPLICATION_BOARD_COLUMNS" :key="column.key" :class="`stage-${column.key}`">
          {{ $t(column.title) }}
        </span>
      </div>
    </header>
    <div v-if="entries.length" class="timeline-list">
      <button
        v-for="entry in entries"
        :key="entry.application.id"
        class="timeline-row"
        :class="`stage-${entry.stage}`"
        type="button"
        @click="$emit('open', entry.application)"
      >
        <time :datetime="entry.application.appliedAt ?? undefined">
          {{ dateLabel(entry.application.appliedAt) }}
        </time>
        <span class="timeline-identity">
          <strong>{{ entry.application.companyName }}</strong>
          <small>{{ entry.application.roleName }}</small>
          <small>{{ activity(entry.application.id) }}</small>
        </span>
        <span class="timeline-track" aria-hidden="true">
          <i
            v-for="(column, index) in APPLICATION_BOARD_COLUMNS"
            :key="column.key"
            :class="{ current: index === entry.stageIndex }"
          >
            <b v-if="index === entry.stageIndex">{{ STATUS_LABELS[entry.application.status] }}</b>
          </i>
        </span>
      </button>
    </div>
    <p v-else class="tracker-empty-view">{{ $t('当前筛选下没有可展示的投递记录。') }}</p>
    <footer class="timeline-note">{{ $t('投递日期与状态变化来自服务端事实记录；本机待同步状态不会伪造成历史事件。') }}</footer>
  </section>
</template>

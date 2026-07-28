<script setup lang="ts">
import { computed } from "vue";

import type { ApplicationRecord } from "@desktop/types";
import {
  APPLICATION_BOARD_COLUMNS,
  applicationStage,
  applicationStageIndex,
} from "../tracker/application-board";
import { STATUS_LABELS } from "../tracker/application-labels";

const props = defineProps<{ applications: ApplicationRecord[] }>();
defineEmits<{ open: [application: ApplicationRecord] }>();

const entries = computed(() => [...props.applications]
  .sort((left, right) => (right.appliedAt ?? right.createdAt).localeCompare(left.appliedAt ?? left.createdAt))
  .map((application) => ({
    application,
    stage: applicationStage(application.status),
    stageIndex: applicationStageIndex(application.status),
  })));

function dateLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value))
    : "待确认";
}
</script>

<template>
  <section class="tracker-timeline" aria-label="投递阶段时间轴">
    <header class="timeline-header">
      <span>投递时间</span>
      <span>公司与岗位</span>
      <div class="timeline-stage-headings">
        <span v-for="column in APPLICATION_BOARD_COLUMNS" :key="column.key" :class="`stage-${column.key}`">
          {{ column.title }}
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
    <p v-else class="tracker-empty-view">当前筛选下没有可展示的投递记录。</p>
    <footer class="timeline-note">仅展示真实投递日期与当前状态；阶段区间将在状态历史接入后补充。</footer>
  </section>
</template>

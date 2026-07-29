<script setup lang="ts">
import type { ApplicationSummary } from "../../../../job-assets/types";
import { STATUS_LABELS } from "../tracker/application-labels";
import { shortDate } from "../job-assets/job-repository-labels";

defineProps<{
  summary: ApplicationSummary;
  resumeCount?: number;
}>();

const statuses = [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "no_response",
] as const;
</script>

<template>
  <section class="repository-summary" aria-label="投递概览">
    <div class="repository-summary-primary">
      <div v-if="resumeCount !== undefined">
        <strong>{{ resumeCount }}</strong>
        <span>针对性简历</span>
      </div>
      <div>
        <strong>{{ summary.total }}</strong>
        <span>投递记录</span>
      </div>
      <div>
        <strong>{{ summary.latest ? STATUS_LABELS[summary.latest.status] : '暂无' }}</strong>
        <span>{{ summary.latest ? shortDate(summary.latest.occurredAt) : '最近投递' }}</span>
      </div>
    </div>
    <div class="repository-status-counts">
      <span
        v-for="status in statuses"
        :key="status"
        class="tracker-exact-status"
        :class="`status-${status}`"
      >
        {{ STATUS_LABELS[status] }} {{ summary.statusCounts[status] }}
      </span>
    </div>
  </section>
</template>

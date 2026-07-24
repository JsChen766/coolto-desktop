<script setup lang="ts">
import { ArrowUpRight, CheckCircle, AlertCircle } from "@lucide/vue";

import type { MatchReportArtifactData } from "../../../../desktop/shared/types";

defineProps<{
  report: MatchReportArtifactData;
}>();

defineEmits<{
  open: [reportId: string];
}>();

function tierLabel(tier: MatchReportArtifactData["tier"]): string {
  if (tier === "excellent") return "优秀";
  if (tier === "good") return "良好";
  if (tier === "moderate") return "基本匹配";
  return "较弱";
}

function tierColor(tier: MatchReportArtifactData["tier"]): string {
  if (tier === "excellent") return "#5c9e6f";
  if (tier === "good") return "#5b8fd4";
  if (tier === "moderate") return "#c8943a";
  return "#b95a5a";
}

function severityLabel(severity: string): string {
  if (severity === "must_have") return "必须";
  if (severity === "preferred") return "优先";
  return "可选";
}
</script>

<template>
  <button
    class="match-report-card"
    type="button"
    @click="$emit('open', report.reportId)"
  >
    <div class="match-card-header">
      <div class="match-score-circle" :style="{ '--tier-color': tierColor(report.tier) }">
        <span class="match-score-num">{{ Math.round(report.finalScore) }}</span>
        <span class="match-score-label">分</span>
      </div>
      <div class="match-card-meta">
        <span class="match-tier-badge" :style="{ color: tierColor(report.tier) }">
          {{ tierLabel(report.tier) }}
        </span>
        <strong class="match-jd-title">{{ report.jdTitle }}</strong>
        <span v-if="report.jdCompany" class="match-jd-company">{{ report.jdCompany }}</span>
      </div>
      <ArrowUpRight class="match-card-open" :size="16" :stroke-width="1.8" aria-hidden="true" />
    </div>

    <ul v-if="report.highlights.length > 0" class="match-highlight-list">
      <li
        v-for="h in report.highlights.slice(0, 3)"
        :key="h.requirementId"
        class="match-highlight-item"
      >
        <CheckCircle :size="12" :stroke-width="2" class="match-hi-icon" aria-hidden="true" />
        {{ h.summary }}
      </li>
    </ul>

    <div v-if="report.gaps.length > 0" class="match-top-gap">
      <AlertCircle :size="12" :stroke-width="2" class="match-gap-icon" aria-hidden="true" />
      <span class="match-gap-severity">{{ severityLabel(report.gaps[0]!.severity) }}</span>
      <span class="match-gap-text">{{ report.gaps[0]!.requirementText }}</span>
    </div>
  </button>
</template>

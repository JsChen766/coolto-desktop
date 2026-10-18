<script setup lang="ts">
import { ArrowUpRight, CheckCircle, AlertCircle } from "@lucide/vue";

import type { MatchReportArtifactData } from "../../../../desktop/shared/types";
import { translate } from "../i18n/locale";

defineProps<{
  report: MatchReportArtifactData;
}>();

defineEmits<{
  open: [reportId: string];
}>();

function tierLabel(tier: MatchReportArtifactData["tier"]): string {
  if (tier === "excellent") return translate("优秀");
  if (tier === "good") return translate("良好");
  if (tier === "moderate") return translate("基本匹配");
  return translate("较弱");
}

function tierColor(tier: MatchReportArtifactData["tier"]): string {
  if (tier === "excellent") return "#5c9e6f";
  if (tier === "good") return "#5b8fd4";
  if (tier === "moderate") return "#c8943a";
  return "#b95a5a";
}

function severityLabel(severity: string): string {
  if (severity === "must_have") return translate("必须");
  if (severity === "preferred") return translate("优先");
  return translate("可选");
}

function displayScore(report: MatchReportArtifactData): number {
  return typeof report.displayScore === "number"
    ? report.displayScore
    : Math.round(report.finalScore);
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
        <span class="match-score-num">{{ displayScore(report) }}</span>
        <span class="match-score-label">{{ $t('分') }}</span>
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

    <p class="match-score-disclaimer">{{ $t('相对参考，非录用概率') }}</p>
    <p
      v-if="report.scoreConfidence === 'low'"
      class="match-score-confidence match-score-confidence-low"
    >
      {{ $t('信息不足，置信度较低') }}
    </p>

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

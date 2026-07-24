<script setup lang="ts">
import { CheckCircle, AlertCircle, BookOpen } from "@lucide/vue";

import type { MatchReportArtifactData, MatchDimensionScore } from "../../../../desktop/shared/types";

defineProps<{
  data: MatchReportArtifactData;
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

function dimensionLabel(key: string): string {
  if (key === "skills") return "技能匹配";
  if (key === "experience") return "经验匹配";
  if (key === "education") return "学历匹配";
  if (key === "overallImpression") return "综合印象";
  return key;
}

function severityLabel(severity: string): string {
  if (severity === "must_have") return "必须";
  if (severity === "preferred") return "优先";
  return "可选";
}

function severityColor(severity: string): string {
  if (severity === "must_have") return "#b95a5a";
  if (severity === "preferred") return "#c8943a";
  return "#888";
}

function scoreBarWidth(dim: MatchDimensionScore): string {
  return `${dim.score}%`;
}

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}
</script>

<template>
  <aside class="match-report-panel">
    <div class="match-panel-header">
      <div class="match-panel-score" :style="{ '--tier-color': tierColor(data.tier) }">
        {{ Math.round(data.finalScore) }}
      </div>
      <div class="match-panel-meta">
        <span class="match-panel-tier" :style="{ color: tierColor(data.tier) }">
          {{ tierLabel(data.tier) }}
        </span>
        <h2 class="match-panel-title">{{ data.jdTitle }}</h2>
        <p v-if="data.jdCompany" class="match-panel-company">{{ data.jdCompany }}</p>
      </div>
    </div>

    <section class="match-panel-section">
      <h3 class="match-panel-section-title">维度得分</h3>
      <ul class="match-dim-list">
        <li v-for="dim in data.dimensions" :key="dim.dimension" class="match-dim-item">
          <div class="match-dim-row">
            <span class="match-dim-name">{{ dimensionLabel(dim.dimension) }}</span>
            <span class="match-dim-weight">权重 {{ Math.round(dim.weight * 100) }}%</span>
            <span class="match-dim-score">{{ Math.round(dim.score) }}</span>
          </div>
          <div class="match-dim-bar-bg">
            <div class="match-dim-bar-fill" :style="{ width: scoreBarWidth(dim) }" />
          </div>
          <p class="match-dim-rationale">{{ dim.rationale }}</p>
        </li>
      </ul>
    </section>

    <section v-if="data.highlights.length > 0" class="match-panel-section">
      <h3 class="match-panel-section-title">
        <CheckCircle :size="14" :stroke-width="2" aria-hidden="true" />
        亮点匹配 ({{ data.highlights.length }})
      </h3>
      <ul class="match-highlight-full-list">
        <li v-for="h in data.highlights" :key="h.requirementId" class="match-highlight-full-item">
          <p class="match-req-text">{{ h.requirementText }}</p>
          <p class="match-hi-summary">{{ h.summary }}</p>
          <ul v-if="h.evidence.length > 0" class="match-evidence-list">
            <li v-for="ev in h.evidence" :key="ev.revisionId" class="match-evidence-item">
              <BookOpen :size="11" :stroke-width="2" aria-hidden="true" />
              "{{ ev.sourceQuote }}"
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section v-if="data.gaps.length > 0" class="match-panel-section">
      <h3 class="match-panel-section-title">
        <AlertCircle :size="14" :stroke-width="2" aria-hidden="true" />
        缺口 ({{ data.gaps.length }})
      </h3>
      <ul class="match-gap-full-list">
        <li v-for="g in data.gaps" :key="g.requirementId" class="match-gap-full-item">
          <div class="match-gap-header-row">
            <span class="match-gap-sev-badge" :style="{ color: severityColor(g.severity) }">
              {{ severityLabel(g.severity) }}
            </span>
            <span class="match-gap-req-text">{{ g.requirementText }}</span>
          </div>
          <p class="match-gap-explanation">{{ g.explanation }}</p>
          <p class="match-gap-suggestion">建议：{{ g.suggestion }}</p>
        </li>
      </ul>
    </section>

    <footer class="match-panel-footer">
      <span>生成于 {{ formatDate(data.generatedAt) }}</span>
      <span v-if="data.expired" class="match-expired-badge">已失效</span>
    </footer>
  </aside>
</template>

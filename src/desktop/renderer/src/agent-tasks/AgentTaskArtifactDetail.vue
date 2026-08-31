<script setup lang="ts">
import type { AgentTaskArtifactView } from "@desktop/types";

defineProps<{ artifact: AgentTaskArtifactView }>();

function sourceLabel(value: string): string {
  if (value.startsWith("web:")) return value.slice(4);
  if (value.startsWith("jd:")) return "当前 JD";
  if (value.startsWith("resume:")) return "当前 Resume";
  if (value.startsWith("experience:")) return "经历证据";
  return "已验证来源";
}
</script>

<template>
  <div class="artifact-detail">
    <template v-if="artifact.kind === 'follow_up_draft'">
      <p>{{ artifact.detail.body }}</p>
      <small>{{ new Date(artifact.detail.scheduledFor).toLocaleString() }} · {{ artifact.detail.timezone }}</small>
    </template>
    <template v-else-if="artifact.kind === 'interview_brief'">
      <section v-for="section in artifact.detail.sections" :key="section.heading">
        <strong>{{ section.heading }}</strong><p>{{ section.content }}</p>
        <small>{{ $t('来源') }}：{{ section.sourceRefs.map(sourceLabel).join('、') }}</small>
      </section>
    </template>
    <template v-else-if="artifact.kind === 'strategy_proposal'">
      <ol><li v-for="item in artifact.detail.recommendations" :key="item">{{ item }}</li></ol>
      <small>{{ artifact.detail.caveat }}</small>
    </template>
    <template v-else>
      <p>{{ artifact.detail.rationale }}</p>
      <blockquote v-for="quote in artifact.detail.evidenceQuotes" :key="quote">{{ quote }}</blockquote>
      <small v-if="artifact.detail.deadlineAt">{{ $t('截止时间') }}：{{ new Date(artifact.detail.deadlineAt).toLocaleString() }}</small>
    </template>
  </div>
</template>

<style scoped>
.artifact-detail { display: grid; gap: 8px; padding: 10px 0 4px; color: var(--text-soft); }
.artifact-detail section { display: grid; gap: 4px; padding-top: 8px; border-top: 1px solid var(--border); }
.artifact-detail p, .artifact-detail ol, .artifact-detail blockquote { margin: 0; }
.artifact-detail p, .artifact-detail li, .artifact-detail blockquote { line-height: 1.55; white-space: pre-wrap; }
.artifact-detail ol { padding-left: 20px; } .artifact-detail small { color: var(--muted); }
.artifact-detail blockquote { padding-left: 10px; border-left: 2px solid var(--border-strong); }
</style>

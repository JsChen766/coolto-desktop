<script setup lang="ts">
import { Briefcase, CheckCircle, Tag, XCircle } from "@lucide/vue";

import type { JdArtifactData } from "../../../../desktop/shared/types";

defineProps<{
  data: JdArtifactData;
}>();

function importanceLabel(value: string): string {
  if (value === "must_have") return "必须";
  if (value === "preferred") return "优先";
  if (value === "nice_to_have") return "加分";
  if (value === "high") return "高";
  if (value === "medium") return "中";
  if (value === "low") return "低";
  return value;
}

function categoryLabel(value: string): string {
  if (value === "skill") return "技能";
  if (value === "experience") return "经验";
  if (value === "education") return "学历";
  if (value === "certification") return "认证";
  if (value === "language") return "语言";
  if (value === "soft_skill") return "软技能";
  return value;
}
</script>

<template>
  <aside class="jd-detail-panel">
    <header class="jd-detail-header">
      <div class="jd-detail-title-wrap">
        <div class="artifact-title icon-label">
          <Briefcase :size="16" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ data.title }}</span>
        </div>
        <span class="jd-detail-status" :class="`jd-status-${data.status}`">
          <CheckCircle v-if="data.status === 'saved'" :size="12" :stroke-width="1.8" />
          <XCircle v-else-if="data.status === 'rejected'" :size="12" :stroke-width="1.8" />
          {{ data.status === 'saved' ? '已保存' : data.status === 'rejected' ? '已拒绝' : '待确认' }}
        </span>
      </div>
    </header>

    <div class="jd-detail-meta">
      <dl class="jd-meta-grid">
        <template v-if="data.company">
          <dt>公司</dt>
          <dd>{{ data.company }}</dd>
        </template>
        <template v-if="data.targetRole">
          <dt>目标角色</dt>
          <dd>{{ data.targetRole }}</dd>
        </template>
        <dt>要求数量</dt>
        <dd>{{ data.requirements.length }} 条</dd>
      </dl>
    </div>

    <div class="jd-requirements-list">
      <h4 class="jd-section-heading">岗位要求</h4>
      <div
        v-for="(req, index) in data.requirements"
        :key="index"
        class="jd-requirement-row"
      >
        <span class="jd-requirement-text">{{ req.text }}</span>
        <div class="jd-requirement-tags">
          <span class="jd-tag">
            <Tag :size="10" :stroke-width="1.8" aria-hidden="true" />
            {{ categoryLabel(req.category) }}
          </span>
          <span class="jd-tag" :class="`jd-importance-${req.importance}`">
            {{ importanceLabel(req.importance) }}
          </span>
        </div>
      </div>
    </div>
  </aside>
</template>

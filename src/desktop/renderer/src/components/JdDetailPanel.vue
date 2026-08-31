<script setup lang="ts">
import { Briefcase, CheckCircle, Tag, XCircle } from "@lucide/vue";

import type { JdArtifactData } from "../../../../desktop/shared/types";
import { translate } from "../i18n/locale";
import { jdSourceLabel } from "../job-assets/jd-source-label";
import { desktopApi } from "../lib/desktop-api";

defineProps<{
  data: JdArtifactData;
}>();

function importanceLabel(value: string): string {
  if (value === "must_have") return translate("必须");
  if (value === "preferred") return translate("优先");
  if (value === "nice_to_have") return translate("加分");
  if (value === "high") return translate("高");
  if (value === "medium") return translate("中");
  if (value === "low") return translate("低");
  return value;
}

function categoryLabel(value: string): string {
  if (value === "skill") return translate("技能");
  if (value === "experience") return translate("经验");
  if (value === "education") return translate("学历");
  if (value === "certification") return translate("认证");
  if (value === "language") return translate("语言");
  if (value === "soft_skill") return translate("软技能");
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
          {{ data.status === 'saved' ? $t('已保存') : data.status === 'rejected' ? $t('已拒绝') : $t('待确认') }}
        </span>
      </div>
    </header>

    <div class="jd-detail-meta">
      <dl class="jd-meta-grid">
        <template v-if="data.company">
          <dt>{{ $t('公司') }}</dt>
          <dd>{{ data.company }}</dd>
        </template>
        <template v-if="data.targetRole">
          <dt>{{ $t('目标角色') }}</dt>
          <dd>{{ data.targetRole }}</dd>
        </template>
        <dt>{{ $t('来源') }}</dt>
        <dd>{{ jdSourceLabel(data.sourceKind) }}</dd>
        <template v-if="data.sourceUrl">
          <dt>{{ $t('来源 URL') }}</dt>
          <dd>
            <button
              class="jd-source-link"
              type="button"
              @click="desktopApi.shell.openExternal(data.sourceUrl!)"
            >
              {{ $t('打开来源页面') }}
            </button>
          </dd>
        </template>
        <dt>{{ $t('要求数量') }}</dt>
        <dd>{{ $tf('{count} 条', { count: data.requirements.length }) }}</dd>
      </dl>
    </div>

    <div class="jd-requirements-list">
      <h4 class="jd-section-heading">{{ $t('岗位要求') }}</h4>
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

<script setup lang="ts">
import {
  ArrowLeft,
  BriefcaseBusiness,
  FileSearch,
  FileText,
  Link2Off,
  Send,
  Sparkles,
} from "@lucide/vue";
import { computed } from "vue";

import type { JobRepositoryJd, JobRepositoryResume } from "@desktop/types";
import { assetSyncLabel, resumeSyncLabel } from "../job-assets/job-repository-labels";
import JobRepositoryApplicationList from "./JobRepositoryApplicationList.vue";
import JobRepositorySummary from "./JobRepositorySummary.vue";

const props = defineProps<{
  jd: JobRepositoryJd;
  resumes: readonly JobRepositoryResume[];
}>();

defineEmits<{
  back: [];
  generate: [];
  match: [];
  record: [];
  tracker: [];
}>();

const targetedResumes = computed(() => {
  const ids = new Set(props.jd.targetedResumeIds);
  return props.resumes.filter((resume) =>
    resume.resumeId ? ids.has(resume.resumeId) : false,
  );
});

function importanceLabel(value: string | null): string {
  if (value === "must_have") return "必须";
  if (value === "preferred") return "优先";
  if (value === "optional") return "可选";
  return "要求";
}
</script>

<template>
  <article class="repository-detail">
    <header class="repository-detail-header">
      <button class="repository-detail-back" type="button" @click="$emit('back')">
        <ArrowLeft :size="16" aria-hidden="true" />返回岗位列表
      </button>
      <div class="repository-detail-title">
        <span class="repository-detail-icon"><BriefcaseBusiness :size="18" aria-hidden="true" /></span>
        <div>
          <h2>{{ jd.title }}</h2>
          <p>{{ [jd.company, jd.targetRole].filter(Boolean).join(' · ') || '未填写岗位信息' }}</p>
        </div>
        <span class="tracker-sync-state" :class="jd.syncStatus">
          {{ assetSyncLabel(jd.syncStatus) }}
        </span>
      </div>
      <div class="repository-detail-actions">
        <button class="primary-button icon-label" type="button" @click="$emit('generate')">
          <Sparkles :size="14" aria-hidden="true" />生成针对性简历
        </button>
        <button class="secondary-button icon-label" type="button" @click="$emit('match')">
          <FileSearch :size="14" aria-hidden="true" />匹配经历
        </button>
        <button class="secondary-button icon-label" type="button" @click="$emit('record')">
          <Send :size="14" aria-hidden="true" />记录投递
        </button>
        <button class="secondary-button icon-label" type="button" @click="$emit('tracker')">
          查看相关投递
        </button>
      </div>
    </header>

    <div class="repository-detail-scroll">
      <JobRepositorySummary
        :summary="jd.applicationSummary"
        :resume-count="jd.targetedResumeIds.length"
      />

      <section class="repository-section">
        <div class="repository-section-heading">
          <div><h3>为本岗位定制的简历</h3><p>由 Resume 的主要目标 JD 决定</p></div>
          <span>{{ targetedResumes.length }}</span>
        </div>
        <div v-if="targetedResumes.length" class="repository-reference-list">
          <div v-for="resume in targetedResumes" :key="resume.entry.entryId">
            <FileText :size="15" aria-hidden="true" />
            <span><strong>{{ resume.entry.displayTitle }}</strong><small>{{ resume.entry.cloud?.targetRole ?? '未填写目标岗位' }}</small></span>
            <span class="library-sync-badge" :class="resume.entry.syncStatus">
              {{ resumeSyncLabel(resume.entry.syncStatus) }}
            </span>
          </div>
        </div>
        <p v-else class="repository-section-empty">暂无针对性简历</p>
      </section>

      <section v-if="jd.otherUsedResumes.length" class="repository-section">
        <div class="repository-section-heading">
          <div><h3>实际投递使用的其他简历</h3><p>只由 Application 投递事实派生</p></div>
          <span>{{ jd.otherUsedResumes.length }}</span>
        </div>
        <div class="repository-reference-list">
          <div v-for="resume in jd.otherUsedResumes" :key="`${resume.state}:${resume.id ?? resume.title}`" :class="resume.state">
            <Link2Off v-if="resume.state !== 'linked'" :size="15" aria-hidden="true" />
            <FileText v-else :size="15" aria-hidden="true" />
            <span><strong>{{ resume.title }}</strong><small>{{ resume.state === 'missing' ? '引用资产已缺失' : resume.state === 'empty' ? '投递记录未关联 Resume' : '非本岗位主要目标简历' }}</small></span>
          </div>
        </div>
      </section>

      <section class="repository-section">
        <div class="repository-section-heading">
          <div><h3>最近投递</h3><p>状态来自投递追踪</p></div>
          <span>{{ jd.applications.length }}</span>
        </div>
        <JobRepositoryApplicationList :applications="jd.applications" context="jd" />
      </section>

      <section class="repository-section">
        <div class="repository-section-heading">
          <div><h3>岗位要求</h3><p>{{ jd.requirements.length }} 条结构化要求</p></div>
        </div>
        <div v-if="jd.requirements.length" class="repository-requirements">
          <div v-for="requirement in jd.requirements" :key="requirement.id">
            <p>{{ requirement.text }}</p>
            <span>{{ importanceLabel(requirement.v2Importance) }}</span>
          </div>
        </div>
        <p v-else class="repository-section-empty">暂无结构化岗位要求</p>
        <details v-if="jd.rawText" class="repository-raw-text">
          <summary>查看 JD 原始内容</summary>
          <p>{{ jd.rawText }}</p>
        </details>
      </section>
    </div>
  </article>
</template>

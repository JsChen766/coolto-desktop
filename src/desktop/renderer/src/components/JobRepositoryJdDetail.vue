<script setup lang="ts">
import {
  ArrowLeft,
  Ellipsis,
  FileSearch,
  FileText,
  Link2Off,
  Send,
  Sparkles,
} from "@lucide/vue";
import { computed } from "vue";

import type { JobRepositoryJd, JobRepositoryResume } from "@desktop/types";
import { STATUS_LABELS } from "../tracker/application-labels";
import {
  assetSyncLabel,
  jobSubtitle,
  resumeSyncLabel,
  shortDate,
} from "../job-assets/job-repository-labels";
import JobRepositoryApplicationList from "./JobRepositoryApplicationList.vue";

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
  resume: [entryId: string];
}>();

const targetedResumes = computed(() => {
  const ids = new Set(props.jd.targetedResumeIds);
  return props.resumes.filter((resume) =>
    resume.resumeId ? ids.has(resume.resumeId) : false,
  );
});
const recentApplications = computed(() => props.jd.applications.slice(0, 3));
const relatedResumeCount = computed(
  () => targetedResumes.value.length + props.jd.otherUsedResumes.length,
);

function importanceLabel(value: string | null): string {
  if (value === "must_have") return "必须";
  if (value === "preferred") return "优先";
  if (value === "optional") return "可选";
  return "要求";
}

function resumeEntryId(resumeId: string | null): string | undefined {
  return props.resumes.find((resume) => resume.resumeId === resumeId)
    ?.entry.entryId;
}
</script>

<template>
  <article class="repository-detail">
    <header class="repository-detail-header">
      <button class="repository-detail-back" type="button" @click="$emit('back')">
        <ArrowLeft :size="16" aria-hidden="true" />返回岗位列表
      </button>
      <div class="repository-detail-title">
        <div>
          <h2>{{ jd.title }}</h2>
          <p v-if="jobSubtitle(jd)">{{ jobSubtitle(jd) }}</p>
        </div>
        <span
          v-if="jd.syncStatus !== 'clean'"
          class="tracker-sync-state"
          :class="jd.syncStatus"
        >
          {{ assetSyncLabel(jd.syncStatus) }}
        </span>
      </div>
      <div class="repository-detail-actions">
        <button class="primary-button icon-label" type="button" @click="$emit('generate')">
          <Sparkles :size="14" aria-hidden="true" />生成针对性简历
        </button>
        <button class="secondary-button icon-label" type="button" @click="$emit('record')">
          <Send :size="14" aria-hidden="true" />记录投递
        </button>
        <details class="repository-more-actions">
          <summary class="repository-more-trigger" aria-label="更多岗位操作">
            <Ellipsis :size="17" :stroke-width="1.8" aria-hidden="true" />
          </summary>
          <div class="repository-action-menu">
            <button class="icon-label" type="button" @click="$emit('match')">
              <FileSearch :size="14" aria-hidden="true" />匹配经历
            </button>
            <button type="button" @click="$emit('tracker')">查看全部投递</button>
          </div>
        </details>
      </div>
    </header>

    <div class="repository-detail-scroll">
      <div class="repository-overview" aria-label="岗位概览">
        <span><strong>{{ relatedResumeCount }}</strong> 份关联简历</span>
        <span><strong>{{ jd.applicationSummary.total }}</strong> 次投递</span>
        <span v-if="jd.applicationSummary.latest">
          最近 {{ STATUS_LABELS[jd.applicationSummary.latest.status] }}
          · {{ shortDate(jd.applicationSummary.latest.occurredAt) }}
        </span>
      </div>

      <section class="repository-section">
        <div class="repository-section-heading">
          <h3>关联简历</h3>
          <span>{{ relatedResumeCount }}</span>
        </div>
        <div v-if="relatedResumeCount" class="repository-reference-list">
          <button
            v-for="resume in targetedResumes"
            :key="resume.entry.entryId"
            type="button"
            @click="$emit('resume', resume.entry.entryId)"
          >
            <FileText :size="15" aria-hidden="true" />
            <span>
              <strong>{{ resume.entry.displayTitle }}</strong>
              <small>{{ resume.entry.cloud?.targetRole ?? '未填写目标岗位' }}</small>
            </span>
            <span class="repository-reference-badges">
              <span class="repository-relation-badge">针对本岗位</span>
              <span
                v-if="!['synced', 'cloud_only'].includes(resume.entry.syncStatus)"
                class="library-sync-badge"
                :class="resume.entry.syncStatus"
              >
                {{ resumeSyncLabel(resume.entry.syncStatus) }}
              </span>
            </span>
          </button>
          <button
            v-for="resume in jd.otherUsedResumes"
            :key="`${resume.state}:${resume.id ?? resume.title}`"
            :class="resume.state"
            type="button"
            :disabled="!resumeEntryId(resume.id)"
            @click="
              resumeEntryId(resume.id) &&
              $emit('resume', resumeEntryId(resume.id)!)
            "
          >
            <Link2Off v-if="resume.state !== 'linked'" :size="15" aria-hidden="true" />
            <FileText v-else :size="15" aria-hidden="true" />
            <span>
              <strong>{{ resume.title }}</strong>
              <small v-if="resume.state === 'missing'">引用资产已缺失</small>
            </span>
            <span class="repository-relation-badge">
              {{ resume.state === 'missing' ? '引用缺失' : '实际使用' }}
            </span>
          </button>
        </div>
        <p v-else class="repository-section-empty">
          暂无关联简历，可先生成针对性简历。
        </p>
      </section>

      <section class="repository-section">
        <div class="repository-section-heading">
          <h3>最近投递</h3>
          <button
            v-if="jd.applications.length"
            class="repository-link-action"
            type="button"
            @click="$emit('tracker')"
          >
            查看全部
          </button>
        </div>
        <JobRepositoryApplicationList :applications="recentApplications" context="jd" />
      </section>

      <details class="repository-collapsible">
        <summary>
          <strong>岗位要求</strong>
          <small>{{ jd.requirements.length }} 条</small>
        </summary>
        <div class="repository-collapsible-body">
          <div v-if="jd.requirements.length" class="repository-requirements">
            <div v-for="requirement in jd.requirements" :key="requirement.id">
              <p>{{ requirement.text }}</p>
              <span>{{ importanceLabel(requirement.v2Importance) }}</span>
            </div>
          </div>
          <p v-else class="repository-section-empty">暂无结构化岗位要求</p>
          <div v-if="jd.rawText" class="repository-raw-text">
            <h4>JD 原始内容</h4>
            <p>{{ jd.rawText }}</p>
          </div>
        </div>
      </details>
    </div>
  </article>
</template>

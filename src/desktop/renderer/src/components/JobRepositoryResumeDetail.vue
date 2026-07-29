<script setup lang="ts">
import { ArrowLeft, FileText, Link, Link2Off, Send } from "@lucide/vue";

import type { JobRepositoryResume, ResumeLibraryEntry } from "@desktop/types";
import {
  resumeKindLabel,
  resumeSyncLabel,
  shortDate,
} from "../job-assets/job-repository-labels";
import JobRepositoryApplicationList from "./JobRepositoryApplicationList.vue";
import JobRepositorySummary from "./JobRepositorySummary.vue";

defineProps<{ resume: JobRepositoryResume }>();
defineEmits<{
  back: [];
  open: [entry: ResumeLibraryEntry];
  record: [];
  tracker: [];
}>();
</script>

<template>
  <article class="repository-detail">
    <header class="repository-detail-header">
      <button class="repository-detail-back" type="button" @click="$emit('back')">
        <ArrowLeft :size="16" aria-hidden="true" />返回简历列表
      </button>
      <div class="repository-detail-title">
        <span class="repository-detail-icon"><FileText :size="18" aria-hidden="true" /></span>
        <div>
          <h2>{{ resume.entry.displayTitle }}</h2>
          <p>{{ resume.entry.cloud?.targetRole ?? resumeKindLabel(resume) }}</p>
        </div>
        <span class="library-sync-badge" :class="resume.entry.syncStatus">
          {{ resumeSyncLabel(resume.entry.syncStatus) }}
        </span>
      </div>
      <div class="repository-detail-actions">
        <span v-if="resume.entry.cloud?.status === 'archived'" class="repository-neutral-badge">已归档</span>
        <button
          v-if="resume.entry.local"
          class="secondary-button icon-label"
          type="button"
          @click="$emit('open', resume.entry)"
        >
          <FileText :size="14" aria-hidden="true" />打开简历
        </button>
        <button
          class="primary-button icon-label"
          type="button"
          :disabled="!resume.resumeId"
          :title="resume.resumeId ? '记录实际投递' : '请先将简历保存到云端'"
          @click="$emit('record')"
        >
          <Send :size="14" aria-hidden="true" />记录投递
        </button>
        <button
          class="secondary-button icon-label"
          type="button"
          :disabled="!resume.resumeId"
          @click="$emit('tracker')"
        >
          查看相关投递
        </button>
      </div>
    </header>

    <div class="repository-detail-scroll">
      <JobRepositorySummary :summary="resume.applicationSummary" />

      <section class="repository-section">
        <div class="repository-section-heading">
          <div><h3>主要目标 JD</h3><p>表示这份简历最初针对的岗位</p></div>
        </div>
        <div class="repository-reference-list">
          <div :class="resume.primaryJd.state">
            <Link2Off v-if="resume.primaryJd.state !== 'linked'" :size="15" aria-hidden="true" />
            <Link v-else :size="15" aria-hidden="true" />
            <span>
              <strong>{{ resume.kind === 'generic' ? '不绑定岗位' : resume.primaryJd.title }}</strong>
              <small>{{ resume.kind === 'local_only' ? '尚未发布为云端 Resume' : resume.kind === 'generic' ? '通用 Resume' : resume.primaryJd.state === 'missing' ? '引用资产已缺失' : '主要目标绑定' }}</small>
            </span>
          </div>
        </div>
      </section>

      <section class="repository-section">
        <div class="repository-section-heading">
          <div><h3>实际投递过的 JD</h3><p>同一份简历可通过 Application 投递多个岗位</p></div>
          <span>{{ resume.appliedJds.length }}</span>
        </div>
        <div v-if="resume.appliedJds.length" class="repository-reference-list">
          <div v-for="jd in resume.appliedJds" :key="`${jd.state}:${jd.id ?? jd.title}`" :class="jd.state">
            <Link2Off v-if="jd.state !== 'linked'" :size="15" aria-hidden="true" />
            <Link v-else :size="15" aria-hidden="true" />
            <span><strong>{{ jd.title }}</strong><small>{{ jd.state === 'missing' ? '引用资产已缺失' : jd.state === 'empty' ? '投递记录未关联 JD' : '实际投递关系' }}</small></span>
          </div>
        </div>
        <p v-else class="repository-section-empty">尚未用于投递</p>
      </section>

      <section class="repository-section">
        <div class="repository-section-heading">
          <div><h3>投递历史</h3><p>按实际投递时间倒序</p></div>
          <span>{{ resume.applications.length }}</span>
        </div>
        <JobRepositoryApplicationList :applications="resume.applications" context="resume" />
      </section>

      <section class="repository-section repository-resume-meta">
        <div><span>类型</span><strong>{{ resumeKindLabel(resume) }}</strong></div>
        <div><span>更新时间</span><strong>{{ shortDate(resume.entry.cloud?.updatedAt ?? resume.entry.local?.updatedAt ?? null) }}</strong></div>
        <div><span>本地版本</span><strong>{{ resume.entry.local ? `${resume.entry.local.checkpointCount} 个检查点` : '无本地草稿' }}</strong></div>
      </section>
    </div>
  </article>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  Ellipsis,
  Eye,
  Link,
  Link2Off,
  Send,
} from "@lucide/vue";
import { computed } from "vue";

import type { JobRepositoryResume, ResumeLibraryEntry } from "@desktop/types";
import { STATUS_LABELS } from "../tracker/application-labels";
import {
  resumeKindLabel,
  resumeSyncLabel,
  shortDate,
} from "../job-assets/job-repository-labels";
import JobRepositoryApplicationList from "./JobRepositoryApplicationList.vue";

const props = defineProps<{ resume: JobRepositoryResume }>();
defineEmits<{
  back: [];
  open: [entry: ResumeLibraryEntry];
  record: [];
  tracker: [];
}>();

const showPrimaryJd = computed(
  () => props.resume.kind !== "generic" && props.resume.primaryJd.state !== "empty",
);
const primaryJdId = computed(() =>
  props.resume.primaryJd.state === "linked" ? props.resume.primaryJd.id : null,
);
const primaryWasApplied = computed(() =>
  props.resume.appliedJds.some((jd) =>
    jd.state === "linked" && jd.id === primaryJdId.value,
  ),
);
const otherAppliedJds = computed(() =>
  props.resume.appliedJds.filter((jd) =>
    jd.state !== "linked" || jd.id !== primaryJdId.value,
  ),
);
const relatedJobCount = computed(
  () => (showPrimaryJd.value ? 1 : 0) + otherAppliedJds.value.length,
);
const recentApplications = computed(() => props.resume.applications.slice(0, 3));
</script>

<template>
  <article class="repository-detail">
    <header class="repository-detail-header">
      <button class="repository-detail-back" type="button" @click="$emit('back')">
        <ArrowLeft :size="16" aria-hidden="true" />{{ $t('返回简历列表') }}
      </button>
      <div class="repository-detail-title">
        <div>
          <h2>{{ resume.entry.displayTitle }}</h2>
          <p>
            {{ resume.entry.cloud?.targetRole ?? resumeKindLabel(resume) }}
        <template v-if="resume.entry.cloud?.status === 'archived'"> · {{ $t('已归档') }}</template>
          </p>
        </div>
        <span
          v-if="!['synced', 'cloud_only'].includes(resume.entry.syncStatus)"
          class="library-sync-badge"
          :class="resume.entry.syncStatus"
        >
          {{ resumeSyncLabel(resume.entry.syncStatus) }}
        </span>
      </div>
      <div class="repository-detail-actions">
        <button
          class="secondary-button icon-label"
          type="button"
          @click="$emit('open', resume.entry)"
        >
          <Eye :size="15" :stroke-width="1.8" aria-hidden="true" />{{ $t('预览简历') }}
        </button>
        <button
          class="primary-button icon-label"
          type="button"
          :disabled="!resume.resumeId"
          :title="resume.resumeId ? $t('记录实际投递') : $t('请先将简历保存到云端')"
          @click="$emit('record')"
        >
          <Send :size="14" aria-hidden="true" />{{ $t('记录投递') }}
        </button>
        <details class="repository-more-actions">
          <summary
            class="repository-more-trigger"
            :aria-label="$t('更多简历操作')"
            :aria-disabled="!resume.resumeId"
          >
            <Ellipsis :size="17" :stroke-width="1.8" aria-hidden="true" />
          </summary>
          <div class="repository-action-menu">
            <button
              type="button"
              :disabled="!resume.resumeId"
              @click="$emit('tracker')"
            >
              {{ $t('查看全部投递') }}
            </button>
          </div>
        </details>
      </div>
    </header>

    <div class="repository-detail-scroll">
      <div class="repository-overview" :aria-label="$t('简历概览')">
        <span>
          <strong>{{ $t('主要目标') }}</strong>
          {{ resume.kind === 'generic' ? $t('通用简历') : resume.primaryJd.title }}
        </span>
        <span>{{ $tf('{count} 个投递岗位', { count: resume.appliedJds.length }) }}</span>
        <span v-if="resume.applicationSummary.latest">
          {{ $tf('最近 {status}', { status: STATUS_LABELS[resume.applicationSummary.latest.status] }) }}
          · {{ shortDate(resume.applicationSummary.latest.occurredAt) }}
        </span>
      </div>

      <section class="repository-section">
        <div class="repository-section-heading">
          <h3>{{ $t('关联岗位') }}</h3>
          <span>{{ relatedJobCount }}</span>
        </div>
        <div v-if="relatedJobCount" class="repository-reference-list">
          <div v-if="showPrimaryJd" :class="resume.primaryJd.state">
            <Link2Off v-if="resume.primaryJd.state !== 'linked'" :size="15" aria-hidden="true" />
            <Link v-else :size="15" aria-hidden="true" />
            <span>
              <strong>{{ resume.primaryJd.title }}</strong>
              <small v-if="resume.primaryJd.state === 'missing'">{{ $t('引用资产已缺失') }}</small>
            </span>
            <span class="repository-relation-badge">
              {{ primaryWasApplied ? $t('主要目标 · 实际投递') : $t('主要目标') }}
            </span>
          </div>
          <div
            v-for="jd in otherAppliedJds"
            :key="`${jd.state}:${jd.id ?? jd.title}`"
            :class="jd.state"
          >
            <Link2Off v-if="jd.state !== 'linked'" :size="15" aria-hidden="true" />
            <Link v-else :size="15" aria-hidden="true" />
            <span>
              <strong>{{ jd.title }}</strong>
              <small v-if="jd.state === 'missing'">{{ $t('引用资产已缺失') }}</small>
            </span>
            <span class="repository-relation-badge">{{ $t('实际投递') }}</span>
          </div>
        </div>
        <p v-else class="repository-section-empty">
          {{ resume.kind === 'generic' ? $t('通用简历，尚未用于投递。') : $t('尚未关联岗位。') }}
        </p>
      </section>

      <section class="repository-section">
        <div class="repository-section-heading">
          <h3>{{ $t('最近投递') }}</h3>
          <button
            v-if="resume.applications.length"
            class="repository-link-action"
            type="button"
            @click="$emit('tracker')"
          >
            {{ $t('查看全部') }}
          </button>
        </div>
        <JobRepositoryApplicationList
          :applications="recentApplications"
          context="resume"
        />
      </section>
    </div>
  </article>
</template>

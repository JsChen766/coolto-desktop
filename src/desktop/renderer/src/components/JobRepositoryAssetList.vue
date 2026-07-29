<script setup lang="ts">
import { BriefcaseBusiness, FileText, Link } from "@lucide/vue";

import type { JobRepositoryJd, JobRepositoryResume } from "@desktop/types";
import { STATUS_LABELS } from "../tracker/application-labels";
import {
  assetSyncLabel,
  resumeKindLabel,
  resumeSyncLabel,
  shortDate,
} from "../job-assets/job-repository-labels";

defineProps<{
  view: "jobs" | "resumes";
  jds: readonly JobRepositoryJd[];
  resumes: readonly JobRepositoryResume[];
  selectedId: string | undefined;
  emptyLabel: string;
}>();

defineEmits<{
  selectJd: [id: string];
  selectResume: [entryId: string];
}>();
</script>

<template>
  <div class="repository-asset-list" :aria-label="view === 'jobs' ? '岗位列表' : '简历列表'">
    <template v-if="view === 'jobs'">
      <button
        v-for="jd in jds"
        :key="jd.id"
        class="repository-asset-row"
        :class="{ active: selectedId === jd.id }"
        type="button"
        @click="$emit('selectJd', jd.id)"
      >
      <BriefcaseBusiness :size="17" aria-hidden="true" />
      <span class="repository-asset-copy">
        <strong>{{ jd.title }}</strong>
        <small>{{ [jd.company, jd.targetRole].filter(Boolean).join(' · ') || '未填写岗位信息' }}</small>
        <span class="repository-row-facts">
          <span>{{ jd.targetedResumeIds.length }} 份针对性简历</span>
          <span>{{ jd.applicationSummary.total }} 次投递</span>
          <span v-if="jd.applicationSummary.latest">
            {{ STATUS_LABELS[jd.applicationSummary.latest.status] }}
            · {{ shortDate(jd.applicationSummary.latest.occurredAt) }}
          </span>
        </span>
      </span>
      <span class="tracker-sync-state" :class="jd.syncStatus">
        {{ assetSyncLabel(jd.syncStatus) }}
      </span>
      </button>
    </template>

    <template v-else>
      <button
        v-for="resume in resumes"
        :key="resume.entry.entryId"
        class="repository-asset-row"
        :class="{ active: selectedId === resume.entry.entryId, archived: resume.entry.cloud?.status === 'archived' }"
        type="button"
        @click="$emit('selectResume', resume.entry.entryId)"
      >
      <FileText :size="17" aria-hidden="true" />
      <span class="repository-asset-copy">
        <strong>{{ resume.entry.displayTitle }}</strong>
        <small>{{ resume.entry.cloud?.targetRole ?? resumeKindLabel(resume) }}</small>
        <span class="repository-row-facts">
          <span><Link :size="11" aria-hidden="true" />{{ resumeKindLabel(resume) }}</span>
          <span>{{ resume.applicationSummary.total }} 次投递</span>
          <span v-if="resume.entry.cloud?.status === 'archived'">已归档</span>
        </span>
      </span>
      <span class="library-sync-badge" :class="resume.entry.syncStatus">
        {{ resumeSyncLabel(resume.entry.syncStatus) }}
      </span>
      </button>
    </template>

    <p v-if="view === 'jobs' ? !jds.length : !resumes.length" class="repository-list-empty">
      {{ emptyLabel }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { BriefcaseBusiness, FileText, Link } from "@lucide/vue";

import type {
  JobRepositoryJd,
  JobRepositoryResume,
} from "@desktop/types";
import { STATUS_LABELS } from "../tracker/application-labels";
import {
  assetSyncLabel,
  jobSubtitle,
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
  <div class="repository-asset-list" :aria-label="view === 'jobs' ? $t('岗位列表') : $t('简历列表')">
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
        <small v-if="jobSubtitle(jd)">{{ jobSubtitle(jd) }}</small>
        <span class="repository-row-facts">
          <span>{{ $tf('{count} 份关联简历', { count: jd.targetedResumeEntryIds.length }) }}</span>
          <span>{{ $tf('{count} 次投递', { count: jd.applicationSummary.total }) }}</span>
          <span v-if="jd.applicationSummary.latest">
            {{ STATUS_LABELS[jd.applicationSummary.latest.status] }}
            · {{ shortDate(jd.applicationSummary.latest.occurredAt) }}
          </span>
        </span>
      </span>
      <span
        v-if="jd.syncStatus !== 'clean'"
        class="tracker-sync-state"
        :class="jd.syncStatus"
      >
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
        <small>{{ resume.entry.cloud?.targetRole ?? resume.entry.local?.targetRole ?? resumeKindLabel(resume) }}</small>
        <span class="repository-row-facts">
          <span><Link :size="11" aria-hidden="true" />{{ resumeKindLabel(resume) }}</span>
          <span>{{ $tf('{count} 次投递', { count: resume.applicationSummary.total }) }}</span>
          <span v-if="resume.entry.cloud?.status === 'archived'">{{ $t('已归档') }}</span>
        </span>
      </span>
      <span
        v-if="!['synced', 'cloud_only'].includes(resume.entry.syncStatus)"
        class="library-sync-badge"
        :class="resume.entry.syncStatus"
      >
        {{ resumeSyncLabel(resume.entry.syncStatus) }}
      </span>
      </button>
    </template>

    <p v-if="view === 'jobs' ? !jds.length : !resumes.length" class="repository-list-empty">
      {{ emptyLabel }}
    </p>
  </div>
</template>

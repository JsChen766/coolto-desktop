<script setup lang="ts">
import { FileText, Link } from "@lucide/vue";

import type { JobRepositoryApplication } from "@desktop/types";
import { STATUS_LABELS, syncLabel } from "../tracker/application-labels";
import { shortDate } from "../job-assets/job-repository-labels";

defineProps<{
  applications: readonly JobRepositoryApplication[];
  context: "jd" | "resume";
}>();
</script>

<template>
  <div v-if="applications.length" class="repository-application-list">
    <article v-for="application in applications" :key="application.id">
      <div class="repository-application-heading">
        <div>
          <strong>{{ application.companyName }}</strong>
          <span>{{ application.roleName }}</span>
        </div>
        <span class="tracker-exact-status" :class="`status-${application.status}`">
          {{ STATUS_LABELS[application.status] }}
        </span>
      </div>
      <div class="repository-application-meta">
        <span>{{ shortDate(application.appliedAt ?? application.createdAt) }}</span>
        <span class="tracker-sync-state" :class="application.syncStatus">
          {{ syncLabel(application.syncStatus) }}
        </span>
      </div>
      <div class="repository-application-reference">
        <Link v-if="context === 'resume'" :size="12" aria-hidden="true" />
        <FileText v-else :size="12" aria-hidden="true" />
        {{ context === 'resume'
          ? (application.jdTitleSnapshot ?? '未关联 JD')
          : (application.resumeTitleSnapshot ?? '未关联 Resume') }}
      </div>
    </article>
  </div>
  <p v-else class="repository-section-empty">暂无投递记录</p>
</template>

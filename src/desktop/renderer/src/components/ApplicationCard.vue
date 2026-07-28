<script setup lang="ts">
import { FileText, Link2 } from "@lucide/vue";

import type { ApplicationRecord, ApplicationStatus } from "@desktop/types";
import { STATUS_LABELS, syncLabel } from "../tracker/application-labels";
import { applicationStage } from "../tracker/application-board";
import ApplicationStatusMenu from "./ApplicationStatusMenu.vue";

defineProps<{
  application: ApplicationRecord;
  busy?: boolean;
}>();

defineEmits<{
  open: [];
  transition: [status: ApplicationStatus];
}>();

function dateLabel(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value))
    : "待确认";
}
</script>

<template>
  <article
    class="tracker-card"
    :class="`stage-${applicationStage(application.status)}`"
  >
    <button class="tracker-card-open" type="button" @click="$emit('open')">
      <div class="tracker-card-heading">
        <div>
          <strong>{{ application.companyName }}</strong>
          <span>{{ application.roleName }}</span>
        </div>
        <span class="tracker-exact-status" :class="`status-${application.status}`">
          {{ STATUS_LABELS[application.status] }}
        </span>
      </div>
      <div class="tracker-card-meta">
        <span>{{ dateLabel(application.appliedAt) }}</span>
        <span class="tracker-sync-state" :class="application.syncStatus">
          {{ syncLabel(application.syncStatus) }}
        </span>
      </div>
      <div
        v-if="application.jdTitleSnapshot || application.resumeTitleSnapshot"
        class="tracker-card-refs"
      >
        <span v-if="application.jdTitleSnapshot">
          <Link2 :size="12" aria-hidden="true" />{{ application.jdTitleSnapshot }}
        </span>
        <span v-if="application.resumeTitleSnapshot">
          <FileText :size="12" aria-hidden="true" />{{ application.resumeTitleSnapshot }}
        </span>
      </div>
    </button>
    <footer class="tracker-card-actions">
      <ApplicationStatusMenu
        :status="application.status"
        :disabled="busy"
        compact
        @select="$emit('transition', $event)"
      />
    </footer>
  </article>
</template>

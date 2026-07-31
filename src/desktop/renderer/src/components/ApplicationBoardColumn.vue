<script setup lang="ts">
import type { ApplicationRecord, ApplicationStatus, InterviewRound, Reminder } from "@desktop/types";
import ApplicationCard from "./ApplicationCard.vue";

defineProps<{
  title: string;
  description: string;
  applications: ApplicationRecord[];
  busy?: boolean;
  interviews: InterviewRound[];
  reminders: Reminder[];
}>();

defineEmits<{
  open: [application: ApplicationRecord];
  transition: [application: ApplicationRecord, status: ApplicationStatus];
}>();
</script>

<template>
  <section class="tracker-column">
    <header class="tracker-column-header">
      <div>
        <strong>{{ title }}</strong>
        <span>{{ description }}</span>
      </div>
      <b>{{ applications.length }}</b>
    </header>
    <div class="tracker-column-list">
      <ApplicationCard
        v-for="application in applications"
        :key="application.id"
        :application="application"
        :busy="busy"
        :interviews="interviews.filter(item => item.applicationId === application.id)"
        :reminders="reminders.filter(item => item.applicationId === application.id)"
        @open="$emit('open', application)"
        @transition="$emit('transition', application, $event)"
      />
      <p v-if="applications.length === 0" class="tracker-column-empty">{{ $t('暂无记录') }}</p>
    </div>
  </section>
</template>

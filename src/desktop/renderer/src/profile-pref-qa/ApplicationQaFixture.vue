<script setup lang="ts">
import { ref } from "vue";

import ApplicationEditorFields from "../components/ApplicationEditorFields.vue";
import { emptyApplicationForm } from "../tracker/application-form";

const form = ref({
  ...emptyApplicationForm(),
  companyName: "Acme",
  roleName: "Engineer",
  appliedAt: new Date().toISOString().slice(0, 16),
});
</script>

<template>
  <ApplicationEditorFields
    v-model="form"
    :references="{ jds: [{ id: 'jd-qa', title: 'Backend JD' }], resumes: [{ id: 'resume-qa', title: '通用简历' }] }"
  />
</template>

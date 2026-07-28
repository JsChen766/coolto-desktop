<script setup lang="ts">
import { computed, ref } from "vue";

import type { ApplicationCreateInput, ApplicationReferenceOptions } from "@desktop/types";
import {
  emptyApplicationForm,
  toCreateInput,
} from "../tracker/application-form";
import ApplicationEditorFields from "./ApplicationEditorFields.vue";

defineProps<{
  references: ApplicationReferenceOptions;
  busy?: boolean;
  error?: string | undefined;
}>();

const emit = defineEmits<{
  close: [];
  submit: [input: ApplicationCreateInput];
}>();

const form = ref(emptyApplicationForm());
const valid = computed(
  () => Boolean(form.value.companyName.trim() && form.value.roleName.trim() && form.value.appliedAt),
);
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <form
      class="dialog-card tracker-create-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="记录一次投递"
      @submit.prevent="emit('submit', toCreateInput(form))"
    >
      <h2>记录一次投递</h2>
      <p>投递完成后创建记录；公司、岗位和关联资产标题会作为当时快照保留。</p>
      <ApplicationEditorFields v-model="form" :references="references" />
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">
          取消
        </button>
        <button class="primary-button" type="submit" :disabled="busy || !valid">
          {{ busy ? "正在保存到本地…" : "保存并等待同步" }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

import type { ExperienceWriteProposal } from "@desktop/types";
import {
  changedExperienceFields,
  experienceProposalImpact,
  experienceProposalTitle,
} from "../experiences/experience-proposal-view";
import { translate } from "../i18n/locale";

const props = defineProps<{
  proposal: ExperienceWriteProposal;
  busy?: boolean;
  error?: string | undefined;
}>();
const emit = defineEmits<{ back: []; close: []; confirm: [] }>();

const fields = computed(() => changedExperienceFields(props.proposal));
const editable = computed(
  () => props.proposal.kind === "create" || props.proposal.kind === "update",
);
const dangerous = computed(
  () => props.proposal.kind === "delete"
    || (props.proposal.kind === "accept_server" && !props.proposal.next),
);
const confirmLabel = computed(() => {
  if (props.busy) return translate("正在处理…");
  return props.proposal.kind === "restore_revision"
    ? translate("确认恢复")
    : translate("确认并写入 Outbox");
});

function dismiss(): void {
  editable.value ? emit("back") : emit("close");
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="dismiss">
    <section
      class="dialog-card experience-proposal-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="experienceProposalTitle(proposal)"
    >
      <h2>{{ experienceProposalTitle(proposal) }}</h2>
      <p>{{ experienceProposalImpact(proposal) }}</p>

      <dl v-if="fields.length" class="experience-proposal-changes">
        <div v-for="field in fields" :key="field.label">
          <dt>{{ field.label }}</dt>
          <dd>
            <span v-if="proposal.current" class="experience-change-before">
              {{ field.before }}
            </span>
            <span>{{ field.after }}</span>
          </dd>
        </div>
      </dl>

      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="busy"
          @click="dismiss"
        >
          {{ editable ? $t('返回修改') : $t('取消') }}
        </button>
        <button
          class="primary-button"
          :class="{ danger: dangerous }"
          type="button"
          :disabled="busy"
          @click="$emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

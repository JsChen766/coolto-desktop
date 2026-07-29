<script setup lang="ts">
import type { ApplicationWriteProposal } from "@desktop/types";
import ApplicationProposalSummary from "./ApplicationProposalSummary.vue";

defineProps<{
  proposal: ApplicationWriteProposal;
  busy?: boolean;
  error?: string | undefined;
}>();
defineEmits<{ close: []; confirm: [proposalId: string] }>();
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section
      class="dialog-card tracker-create-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="确认纠正关联"
    >
      <h2>确认纠正关联</h2>
      <p>请核对原关联与新关联。确认后更新原记录，不生成副本。</p>
      <ApplicationProposalSummary :proposal="proposal" />
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">
          返回修改
        </button>
        <button
          class="primary-button"
          type="button"
          :disabled="busy"
          @click="$emit('confirm', proposal.id)"
        >
          {{ busy ? "正在写入本地…" : "确认纠正关联" }}
        </button>
      </div>
    </section>
  </div>
</template>

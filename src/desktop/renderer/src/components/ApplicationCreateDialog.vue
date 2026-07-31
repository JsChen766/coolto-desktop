<script setup lang="ts">
import { computed, ref } from "vue";

import type {
  ApplicationCreateInput,
  ApplicationReferenceOptions,
  ApplicationWriteProposal,
} from "@desktop/types";
import {
  prefilledApplicationForm,
  toCreateInput,
} from "../tracker/application-form";
import ApplicationEditorFields from "./ApplicationEditorFields.vue";
import ApplicationProposalSummary from "./ApplicationProposalSummary.vue";

const props = defineProps<{
  references: ApplicationReferenceOptions;
  initial?: Partial<ApplicationCreateInput> | undefined;
  proposal?: ApplicationWriteProposal | undefined;
  busy?: boolean;
  error?: string | undefined;
}>();

const emit = defineEmits<{
  close: [];
  review: [input: ApplicationCreateInput];
  confirm: [proposalId: string];
  back: [];
}>();

const form = ref(prefilledApplicationForm(props.initial));
const valid = computed(
  () => Boolean(
    form.value.companyName.trim()
    && form.value.roleName.trim()
    && form.value.appliedAt
    && form.value.jdId
    && form.value.resumeId,
  ),
);
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <form
      class="dialog-card tracker-create-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('记录一次投递')"
      @submit.prevent="proposal
        ? emit('confirm', proposal.id)
        : emit('review', toCreateInput(form))"
    >
      <h2>{{ $t('记录一次投递') }}</h2>
      <p v-if="proposal">{{ $t('请核对实际投递关系与 Resume 内容指纹，再执行最终确认。') }}</p>
      <p v-else>{{ $t('投递完成后记录；JD 与实际使用的 Resume 均为必选。') }}</p>
      <ApplicationProposalSummary v-if="proposal" :proposal="proposal" />
      <ApplicationEditorFields
        v-else
        v-model="form"
        :references="references"
        require-references
      />
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="busy"
          @click="proposal ? $emit('back') : $emit('close')"
        >
          {{ proposal ? $t('返回修改') : $t('取消') }}
        </button>
        <button class="primary-button" type="submit" :disabled="busy || !valid">
          {{ busy ? $t('正在处理…') : proposal ? $t('确认并写入 Outbox') : $t('检查投递信息') }}
        </button>
      </div>
    </form>
  </div>
</template>

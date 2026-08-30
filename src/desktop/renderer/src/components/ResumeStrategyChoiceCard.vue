<script setup lang="ts">
import { ArrowRight, FileText, LoaderCircle, X } from "@lucide/vue";

import type {
  DesktopApprovalDecision,
  DesktopApprovalRequest,
} from "@desktop/types";

defineProps<{ request: DesktopApprovalRequest; busy?: boolean }>();
defineEmits<{ decide: [decision: DesktopApprovalDecision] }>();
</script>

<template>
  <section
    class="approval-card"
    data-testid="resume-strategy-choice-card"
    :data-approval-action-type="request.actionType"
  >
    <header class="approval-heading">
      <div class="approval-icon" aria-hidden="true">
        <FileText :size="18" :stroke-width="1.8" />
      </div>
      <div>
        <h3>{{ $t(request.title) }}</h3>
        <p>{{ $t('请选择下一步') }}</p>
      </div>
    </header>
    <p class="approval-description">{{ $t(request.description) }}</p>
    <div class="approval-actions">
      <button
        class="approval-button primary icon-label"
        data-testid="resume-strategy-use-general"
        type="button"
        :disabled="busy"
        @click="$emit('decide', { type: 'accept' })"
      >
        <LoaderCircle
          v-if="busy"
          class="spin"
          :size="16"
          :stroke-width="2"
          aria-hidden="true"
        />
        <FileText v-else :size="16" :stroke-width="1.9" aria-hidden="true" />
        <span>{{ $t('使用通用简历') }}</span>
        <ArrowRight :size="15" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button
        class="approval-button icon-label"
        data-testid="resume-strategy-stop-application"
        type="button"
        :disabled="busy"
        @click="$emit('decide', { type: 'reject' })"
      >
        <X :size="16" :stroke-width="1.9" aria-hidden="true" />
        <span>{{ $t('不继续投递') }}</span>
      </button>
    </div>
  </section>
</template>

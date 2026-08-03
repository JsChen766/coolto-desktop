<script setup lang="ts">
import {
  ArrowRight,
  Check,
  MessageSquareText,
  ShieldCheck,
  TriangleAlert,
  X,
} from "@lucide/vue";
import { nextTick, ref, watch } from "vue";

import type {
  DesktopApprovalDecision,
  DesktopApprovalRequest,
} from "@desktop/types";

const props = defineProps<{
  request: DesktopApprovalRequest;
  busy?: boolean;
}>();

const emit = defineEmits<{
  decide: [decision: DesktopApprovalDecision];
}>();

const customOpen = ref(false);
const customText = ref("");
const customInput = ref<HTMLTextAreaElement>();
const selectedCandidates = ref<string[]>([]);
const profileValues = ref<Record<string, string>>({});
const selectedProfileFields = ref<string[]>([]);

watch(() => props.request, (request) => {
  selectedCandidates.value = (request.preview.items ?? [])
    .filter((item) => item.id && !item.warning).map((item) => item.id!);
  selectedProfileFields.value = (request.preview.profileFields ?? [])
    .filter((field) => field.selectedByDefault).map((field) => field.field);
  profileValues.value = Object.fromEntries((request.preview.profileFields ?? [])
    .map((field) => [field.field, field.proposedValue]));
}, { immediate: true });

async function openCustom(): Promise<void> {
  customOpen.value = true;
  await nextTick();
  customInput.value?.focus();
}

function submitCustom(): void {
  const text = customText.value.trim();
  if (text) {
    emit("decide", { type: "custom", text });
  }
}

function accept(): void {
  const profileFields = selectedProfileFields.value.map((field) => ({
    field, value: profileValues.value[field] ?? "",
  }));
  emit("decide", { type: "accept", selection: {
    ...(profileFields.length ? { profileFields } : {}),
    ...(selectedCandidates.value.length ? { candidateIds: selectedCandidates.value } : {}),
  } });
}
</script>

<template>
  <section class="approval-card">
    <header class="approval-heading">
      <div class="approval-icon" aria-hidden="true">
        <ShieldCheck :size="18" :stroke-width="1.8" />
      </div>
      <div>
        <h3>{{ $t(request.title) }}</h3>
        <p>{{ $t('Agent 正在等待你的确认') }}</p>
      </div>
    </header>

    <p class="approval-description">{{ $t(request.description) }}</p>

    <dl v-if="request.preview.summary.length" class="approval-summary">
      <template v-for="field in request.preview.summary" :key="field.label">
        <dt>{{ $t(field.label) }}</dt>
        <dd>{{ field.value }}</dd>
      </template>
    </dl>

    <section v-if="request.preview.profileFields?.length" class="approval-import-section">
      <h4>{{ $t('个人资料') }}</h4>
      <label v-for="field in request.preview.profileFields" :key="field.field" class="approval-profile-field">
        <input v-model="selectedProfileFields" type="checkbox" :value="field.field">
        <span>
          <small>{{ $t(field.label) }}</small>
          <span class="approval-value-diff">{{ field.currentValue || $t('未填写') }} →</span>
          <input v-model="profileValues[field.field]" :aria-label="$t(field.label)">
          <span v-if="field.confidence === 'low'" class="approval-warning icon-label">
            <TriangleAlert :size="14" :stroke-width="1.8" aria-hidden="true" />
            {{ $t('低置信度，请核对') }}
          </span>
        </span>
      </label>
    </section>

    <div
      v-for="item in request.preview.items ?? []"
      :key="item.title"
      class="approval-item"
    >
      <label v-if="item.id" class="approval-item-title">
        <input v-model="selectedCandidates" type="checkbox" :value="item.id" :disabled="Boolean(item.warning)">
        <strong>{{ item.title }}</strong>
      </label>
      <strong v-else>{{ item.title }}</strong>
      <p v-if="item.description">{{ $t(item.description) }}</p>
      <div v-if="item.fields?.length" class="approval-item-fields">
        <span v-for="field in item.fields" :key="field.label">
          <small>{{ $t(field.label) }}</small>
          {{ field.value }}
        </span>
      </div>
      <p v-if="item.warning" class="approval-warning icon-label">
        <TriangleAlert :size="14" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t(item.warning) }}</span>
      </p>
    </div>

    <div class="approval-actions">
      <button
        class="approval-button primary icon-label"
        type="button"
        :disabled="busy"
        @click="accept"
      >
        <Check :size="16" :stroke-width="2" aria-hidden="true" />
        <span>{{ $t('接受并执行') }}</span>
        <ArrowRight
          class="action-arrow"
          :size="15"
          :stroke-width="1.8"
          aria-hidden="true"
        />
      </button>
      <button
        class="approval-button icon-label"
        type="button"
        :disabled="busy"
        @click="$emit('decide', { type: 'reject' })"
      >
        <X :size="16" :stroke-width="1.9" aria-hidden="true" />
        <span>{{ $t('拒绝') }}</span>
      </button>
      <button
        class="approval-button icon-label"
        type="button"
        :disabled="busy"
        @click="openCustom"
      >
        <MessageSquareText :size="16" :stroke-width="1.8" aria-hidden="true" />
        <span>{{ $t('自定义回答') }}</span>
      </button>
    </div>

    <div v-if="customOpen" class="approval-custom">
      <textarea
        ref="customInput"
        v-model="customText"
        rows="3"
        :placeholder="$t('告诉 Agent 应该如何调整…')"
        @keydown.enter.exact.prevent="submitCustom"
      />
      <div class="approval-custom-footer">
        <span>{{ $t('Enter 提交 · Shift+Enter 换行') }}</span>
        <button
          class="small-primary-button"
          type="button"
          :disabled="!customText.trim() || busy"
          @click="submitCustom"
        >
          {{ $t('提交') }}
        </button>
      </div>
    </div>
  </section>
</template>

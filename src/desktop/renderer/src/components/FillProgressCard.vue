<script setup lang="ts">
import { computed } from "vue";
import { CheckCircle, CircleAlert, ShieldAlert, XCircle } from "@lucide/vue";

import type { BrowserFillRecordView } from "@desktop/types";

const props = defineProps<{
  records: BrowserFillRecordView[];
  reviewing: boolean;
  pendingCount: number;
  acceptedCount: number;
  rejectedCount: number;
  lastOutcome?:
    | {
        action: "accepted" | "rejected" | "mixed";
        acceptedCount: number;
        rejectedCount: number;
      }
    | undefined;
  captcha?: { kind: string; detail?: string } | undefined;
}>();

const emit = defineEmits<{
  abort: [];
  dismissOutcome: [];
  dismissCaptcha: [];
}>();

const hasRecords = computed(() => props.records.length > 0);
const showOutcome = computed(
  () => !hasRecords.value && !props.reviewing && props.lastOutcome !== undefined,
);
const captchaLabel = computed(() => {
  if (!props.captcha) return "";
  switch (props.captcha.kind) {
    case "recaptcha":
      return "reCAPTCHA";
    case "hcaptcha":
      return "hCaptcha";
    case "geetest":
      return "极验";
    case "slider":
      return "滑块验证";
    case "image":
      return "图形验证码";
    default:
      return "验证码";
  }
});

function decisionLabel(decision: BrowserFillRecordView["decision"]): string {
  if (decision === "accepted") return "已接受";
  if (decision === "rejected") return "已拒绝";
  return props.reviewing ? "待审核" : "已写入";
}
</script>

<template>
  <div v-if="hasRecords || showOutcome || captcha" class="fill-progress-card">
    <header v-if="hasRecords" class="fp-header">
      <span class="fp-title">
        <ShieldAlert :size="16" :stroke-width="1.8" />
        {{ reviewing ? "请在浏览器 Overlay 上逐项审核" : "AI 正在按你的授权填写页面" }}
      </span>
      <button
        v-if="!reviewing"
        type="button"
        class="fp-abort"
        @click="emit('abort')"
      >
        中止并进入审核
      </button>
    </header>

    <ul v-if="hasRecords" class="fp-list">
      <li
        v-for="record in records"
        :key="record.fillId"
        class="fp-item"
        :data-decision="record.decision"
      >
        <span class="fp-label">
          {{ record.label || record.fillId }}
          <span class="fp-type">{{ record.elementType }}</span>
        </span>
        <span class="fp-value">{{ record.writtenValue }}</span>
        <span class="fp-badge" :data-decision="record.decision">
          <CheckCircle
            v-if="record.decision === 'accepted'"
            :size="14"
            :stroke-width="1.8"
          />
          <XCircle
            v-else-if="record.decision === 'rejected'"
            :size="14"
            :stroke-width="1.8"
          />
          <CircleAlert v-else :size="14" :stroke-width="1.8" />
          {{ decisionLabel(record.decision) }}
        </span>
      </li>
    </ul>

    <p v-if="hasRecords" class="fp-summary">
      共 {{ records.length }} 项 · 待处理 {{ pendingCount }} · 已接受
      {{ acceptedCount }} · 已拒绝 {{ rejectedCount }}
    </p>

    <div v-if="showOutcome && lastOutcome" class="fp-outcome">
      <span>
        本轮审核完成：接受 {{ lastOutcome.acceptedCount }} 项，拒绝
        {{ lastOutcome.rejectedCount }} 项。最终提交请你手动完成。
      </span>
      <button type="button" @click="emit('dismissOutcome')">好的</button>
    </div>

    <div v-if="captcha" class="fp-captcha">
      <span>
        检测到 {{ captchaLabel }}，AI 已暂停写入。请你手动通过验证码后再让 AI 继续。
      </span>
      <button type="button" @click="emit('dismissCaptcha')">已处理</button>
    </div>
  </div>
</template>

<style scoped>
.fill-progress-card {
  border: 1px solid #d4d4d8;
  border-radius: 10px;
  background: #fafaf9;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}
.fp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.fp-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #334155;
  font-weight: 600;
}
.fp-abort {
  border: 1px solid #ef4444;
  color: #ef4444;
  background: #fff;
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font: inherit;
}
.fp-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fp-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) auto;
  gap: 10px;
  align-items: center;
  padding: 6px 8px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}
.fp-item[data-decision="accepted"] {
  border-color: #22c55e;
}
.fp-item[data-decision="rejected"] {
  border-color: #ef4444;
  opacity: 0.75;
}
.fp-label {
  color: #0f172a;
  display: flex;
  gap: 6px;
  align-items: baseline;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-type {
  font-size: 11px;
  color: #94a3b8;
  text-transform: uppercase;
}
.fp-value {
  color: #475569;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fp-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
}
.fp-badge[data-decision="accepted"] {
  color: #16a34a;
}
.fp-badge[data-decision="rejected"] {
  color: #dc2626;
}
.fp-summary {
  margin: 0;
  color: #64748b;
  font-size: 12px;
}
.fp-outcome,
.fp-captcha {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 8px;
}
.fp-outcome {
  background: #ecfdf5;
  color: #065f46;
}
.fp-captcha {
  background: #fef3c7;
  color: #92400e;
}
.fp-outcome button,
.fp-captcha button {
  border: none;
  background: rgba(15, 23, 42, 0.1);
  color: inherit;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
</style>

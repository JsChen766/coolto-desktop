<script setup lang="ts">
import { computed } from "vue";

import type { DesktopCreditSummary } from "@desktop/types";

import { translate } from "../i18n/locale.js";

const props = defineProps<{
  summary: DesktopCreditSummary;
  totalCredits: number;
}>();

const freeShare = computed(() => {
  if (props.totalCredits <= 0) return 0;
  return Math.round((props.summary.weeklyFreeCredits / props.totalCredits) * 100);
});

function formatExpiry(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`;
}

function planLabel(planType: string): string {
  if (planType === "WEEKLY" || planType === "MONTHLY") {
    return translate(planType === "WEEKLY" ? "周付" : "月付");
  }
  return planType;
}
</script>

<template>
  <section class="credit-balance-summary" :aria-label="$t('可用余额')">
    <div class="credit-balance-heading">
      <div>
        <p class="credit-balance-label">{{ $t('可用余额') }}</p>
        <p v-if="summary.unlimited" class="credit-balance-total">{{ $t('无限量') }}</p>
        <p v-else class="credit-balance-total">{{ totalCredits }} <span>Credits</span></p>
      </div>
      <span v-if="summary.unlimited" class="credit-plan-badge">{{ $t('不限量用户（不扣费）') }}</span>
      <span v-else-if="summary.planType !== 'NONE'" class="credit-plan-badge">{{ planLabel(summary.planType) }}</span>
    </div>

    <p v-if="summary.unlimited" class="credit-unlimited-note">
      {{ $t('当前账号使用任务时不扣除 Credit。') }}
    </p>

    <div v-else class="credit-composition-bar" aria-hidden="true">
      <span class="credit-composition-free" :style="{ width: `${freeShare}%` }" />
    </div>

    <dl v-if="!summary.unlimited" class="credit-balance-sources">
      <div>
        <dt>{{ $t('本周免费') }}</dt>
        <dd>{{ summary.weeklyFreeCredits }} <span>Credits</span></dd>
        <small v-if="summary.weeklyFreeExpiresAt">{{ $t('到期') }} {{ formatExpiry(summary.weeklyFreeExpiresAt) }}</small>
      </div>
      <div>
        <dt>{{ $t('付费余额') }}</dt>
        <dd>{{ summary.creditBalance }} <span>Credits</span></dd>
        <small v-if="summary.creditExpiresAt">{{ $t('到期') }} {{ formatExpiry(summary.creditExpiresAt) }}</small>
      </div>
    </dl>
  </section>
</template>

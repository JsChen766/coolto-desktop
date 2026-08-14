<script setup lang="ts">
import { computed } from "vue";

import type { CheckoutPlan } from "@desktop/types";

import { translate } from "../i18n/locale.js";
import type { PurchasePhase } from "../credits/use-credit-dialog.js";

const props = defineProps<{
  plans: CheckoutPlan[];
  phase: PurchasePhase;
  busy: boolean;
  purchaseError?: string | undefined;
}>();
const emit = defineEmits<{
  purchase: [planType: string];
  verify: [];
  reset: [];
}>();

const phaseText = computed(() => {
  switch (props.phase) {
    case "opening":
      return translate("正在打开付款页面…");
    case "waiting":
      return translate("请在浏览器中完成付款，正在确认支付结果…");
    case "success":
      return translate("购买成功！Credit 已到账");
    case "timeout":
      return translate("暂未检测到支付结果。如已完成付款，请点击下方按钮手动查询");
    case "error":
      return translate("购买未完成，请重试。");
    default:
      return "";
  }
});

const purchasePending = computed(
  () => props.busy || props.phase === "opening" || props.phase === "waiting",
);

function planLabel(planType: CheckoutPlan["planType"]): string {
  return translate(planType === "WEEKLY" ? "周付" : "月付");
}

function formatPrice(priceCny: number): string {
  return `¥${(priceCny / 100).toFixed(2)}`;
}
</script>

<template>
  <section class="credit-plan-section" :aria-labelledby="'credit-plan-title'">
    <h3 id="credit-plan-title" class="credit-section-title">{{ $t('选择套餐') }}</h3>
    <div class="credit-plans">
      <article
        v-for="plan in plans"
        :key="plan.planType"
        class="credit-plan-card"
        :class="plan.planType === 'MONTHLY' ? 'is-primary' : 'is-secondary'"
      >
        <div class="credit-plan-heading">
          <p class="credit-plan-name">{{ planLabel(plan.planType) }}</p>
          <div v-if="plan.planType === 'MONTHLY'" class="credit-plan-tags">
            <span class="credit-plan-tag">{{ $t('推荐') }}</span>
            <span class="credit-plan-tag">{{ $t('更划算') }}</span>
          </div>
        </div>
        <p class="credit-plan-price">{{ formatPrice(plan.priceCny) }}</p>
        <p class="credit-plan-meta">{{ plan.credits }} Credits · {{ plan.validDays }} {{ $t('天') }}</p>
        <button
          class="credit-plan-buy"
          :class="plan.planType === 'MONTHLY' ? 'primary-button' : 'secondary-button'"
          type="button"
          :disabled="purchasePending"
          @click="emit('purchase', plan.planType)"
        >
          {{ $t('立即购买') }}
        </button>
      </article>
    </div>
    <p class="credit-note">{{ $t('套餐可叠加购买、各自独立过期；首次付费后免费体验额度自动清除（每周免费保留）。') }}</p>

    <aside v-if="phase !== 'idle'" class="credit-payment-status" :class="`is-${phase}`" role="status" aria-live="polite">
      <p>{{ phaseText }}</p>
      <p v-if="purchaseError" class="credit-payment-error" role="alert">{{ purchaseError }}</p>
      <button v-if="phase === 'timeout'" class="secondary-button" type="button" :disabled="busy" @click="emit('verify')">
        {{ $t('检查支付结果') }}
      </button>
      <button v-if="phase === 'error'" class="secondary-button" type="button" @click="emit('reset')">
        {{ $t('重试') }}
      </button>
    </aside>
  </section>
</template>

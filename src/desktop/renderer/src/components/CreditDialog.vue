<script setup lang="ts">
import { X } from "@lucide/vue";
import { computed, onMounted, onUnmounted, ref } from "vue";

import type { DesktopApi } from "@desktop/types";

import { useCreditDialog } from "../credits/use-credit-dialog.js";

const props = defineProps<{ api: DesktopApi }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement>();

const {
  summary,
  plans,
  phase,
  busy,
  loadError,
  purchaseError,
  totalCredits,
  loadAll,
  startPurchase,
  verifyPayment,
  dispose,
} = useCreditDialog(props.api);

const planTypeLabel: Record<string, string> = {
  WEEKLY: "周付",
  MONTHLY: "月付",
};

const transactionLabels: Record<string, string> = {
  USAGE: "AI 操作消耗",
  PURCHASE: "购买套餐",
  FREE_TRIAL_GRANT: "免费体验",
  FREE_TRIAL_EXPIRY: "免费体验过期",
  WEEKLY_FREE_GRANT: "本周免费",
  WEEKLY_FREE_USAGE: "本周免费消耗",
  WEEKLY_FREE_EXPIRY: "本周免费过期",
  EXPIRY: "额度过期",
};

const phaseText = computed(() => {
  switch (phase.value) {
    case "opening":
      return "正在打开付款页面…";
    case "waiting":
      return "请在浏览器中完成付款，正在确认支付结果…";
    case "success":
      return "购买成功！Credit 已到账";
    case "timeout":
      return "暂未检测到支付结果。如已完成付款，请点击下方按钮手动查询";
    default:
      return "";
  }
});

const freeShare = computed(() => {
  const total = totalCredits.value;
  if (total <= 0) return 0;
  return Math.round(((summary.value?.weeklyFreeCredits ?? 0) / total) * 100);
});

function transactionText(type: string): string {
  return transactionLabels[type] ?? type;
}

function formatCredits(amount: number): string {
  return amount > 0 ? `+${amount}` : `${amount}`;
}

function formatExpiry(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getMonth() + 1}-${String(date.getDate()).padStart(2, "0")}`;
}

function buy(planType: string): void {
  void startPurchase(planType);
}

function dismiss(): void {
  emit("close");
}

function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hidden);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  dialog.value?.querySelector<HTMLElement>("[data-credit-initial-focus]")?.focus();
  void loadAll();
});
onUnmounted(dispose);
</script>

<template>
  <div class="dialog-backdrop credit-dialog-backdrop" @mousedown.self="dismiss">
    <section
      ref="dialog"
      class="dialog-card credit-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-dialog-title"
      tabindex="-1"
      @keydown="keydown"
    >
      <header class="credit-dialog-header">
        <div>
          <h2 id="credit-dialog-title">{{ $t('Credit 与套餐') }}</h2>
          <p>{{ $t('管理你的额度与套餐，购买后 Credit 自动到账。') }}</p>
        </div>
        <button class="icon-button" type="button" :aria-label="$t('关闭 Credit 窗口')" @click="dismiss">
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <p v-if="loadError" class="credit-dialog-error" role="alert">{{ loadError }}</p>
      <p v-else-if="busy && !summary" class="credit-dialog-loading" role="status">{{ $t('加载中…') }}</p>

      <template v-if="summary">
        <section class="credit-section">
          <div class="credit-balance-row">
            <div>
              <p class="credit-balance-label">{{ $t('可用余额') }}</p>
              <p class="credit-balance-total">{{ totalCredits }} <span>Credits</span></p>
            </div>
            <span v-if="summary.planType !== 'NONE'" class="credit-plan-badge">
              {{ planTypeLabel[summary.planType] ?? summary.planType }}
            </span>
          </div>
          <div class="credit-composition-bar" aria-hidden="true">
            <span class="credit-composition-free" :style="{ width: `${freeShare}%` }" />
          </div>
          <div class="credit-balance-sources">
            <p>
              {{ $t('本周免费') }} {{ summary.weeklyFreeCredits }}
              <span v-if="summary.weeklyFreeExpiresAt">· {{ $t('到期') }} {{ formatExpiry(summary.weeklyFreeExpiresAt) }}</span>
            </p>
            <p>
              {{ $t('付费余额') }} {{ summary.creditBalance }}
              <span v-if="summary.creditExpiresAt">· {{ $t('到期') }} {{ formatExpiry(summary.creditExpiresAt) }}</span>
            </p>
          </div>
        </section>

        <section class="credit-section">
          <h3 class="credit-section-title">{{ $t('选择套餐') }}</h3>
          <div class="credit-plans">
            <div v-for="plan in plans" :key="plan.planType" class="credit-plan-card">
              <p class="credit-plan-name">{{ planTypeLabel[plan.planType] ?? plan.planType }}</p>
              <p class="credit-plan-price">¥{{ (plan.priceCny / 100).toFixed(2) }}</p>
              <p class="credit-plan-meta">{{ plan.credits }} Credits · {{ plan.validDays }} 天</p>
              <p class="credit-plan-tag">
                {{ plan.planType === "MONTHLY" ? "更划算 · 推荐" : "补充包 · 快速到账" }}
              </p>
              <button
                class="primary-button credit-plan-buy"
                type="button"
                :disabled="busy || phase === 'opening' || phase === 'waiting'"
                @click="buy(plan.planType)"
              >
                {{ $t('立即购买') }}
              </button>
            </div>
          </div>
          <p class="credit-note">{{ $t('套餐可叠加购买、各自独立过期；首次付费后免费体验额度自动清除（每周免费保留）。') }}</p>
        </section>

        <section v-if="phase !== 'idle'" class="credit-section credit-payment-status" :class="`is-${phase}`" role="status">
          <p>{{ phaseText }}</p>
          <p v-if="purchaseError" class="credit-payment-error" role="alert">{{ purchaseError }}</p>
          <button
            v-if="phase === 'timeout'"
            class="secondary-button"
            type="button"
            :disabled="busy"
            @click="verifyPayment"
          >
            {{ $t('检查支付结果') }}
          </button>
          <button v-if="phase === 'error'" class="secondary-button" type="button" @click="phase = 'idle'">
            {{ $t('重试') }}
          </button>
        </section>

        <section v-if="summary.recentTransactions.length" class="credit-section">
          <h3 class="credit-section-title">{{ $t('最近流水') }}</h3>
          <ul class="credit-transactions">
            <li v-for="(tx, index) in summary.recentTransactions" :key="index">
              <span>{{ transactionText(tx.transactionType) }}</span>
              <span class="credit-tx-amount" :class="{ negative: tx.amount < 0 }">
                {{ formatCredits(tx.amount) }}
              </span>
            </li>
          </ul>
        </section>
      </template>
    </section>
  </div>
</template>

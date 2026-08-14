<script setup lang="ts">
import { X } from "@lucide/vue";
import { onMounted, onUnmounted, useTemplateRef } from "vue";

import type { DesktopApi } from "@desktop/types";

import { useCreditDialog } from "../credits/use-credit-dialog.js";
import CreditBalanceSummary from "./CreditBalanceSummary.vue";
import CreditPlanCatalog from "./CreditPlanCatalog.vue";

const props = defineProps<{ api: DesktopApi }>();
const emit = defineEmits<{ close: [] }>();
const dialog = useTemplateRef<HTMLElement>("dialog");

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
  resetPurchase,
  dispose,
} = useCreditDialog(props.api);

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
        <button
          class="icon-button"
          type="button"
          data-credit-initial-focus
          :aria-label="$t('关闭 Credit 窗口')"
          @click="dismiss"
        >
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <div class="credit-dialog-body conversation-scroll">
        <p v-if="loadError" class="credit-dialog-error" role="alert">{{ loadError }}</p>
        <p v-else-if="busy && !summary" class="credit-dialog-loading" role="status">{{ $t('加载中…') }}</p>

        <template v-if="summary">
          <CreditBalanceSummary :summary="summary" :total-credits="totalCredits" />
          <CreditPlanCatalog
            :plans="plans"
            :phase="phase"
            :busy="busy"
            :purchase-error="purchaseError"
            @purchase="buy"
            @verify="verifyPayment"
            @reset="resetPurchase"
          />
        </template>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { X } from "@lucide/vue";
import { ref } from "vue";

import type { CreditBalanceDetail } from "@desktop/types";

const props = defineProps<{
  detail: CreditBalanceDetail;
}>();
const emit = defineEmits<{
  close: [];
  goPurchase: [];
}>();
const dialog = ref<HTMLElement>();

function dismiss(): void {
  emit("close");
}

function goPurchase(): void {
  emit("goPurchase");
}

function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), [tabindex]:not([tabindex='-1'])",
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
</script>

<template>
  <div class="dialog-backdrop insufficient-dialog-backdrop" @mousedown.self="dismiss">
    <section
      ref="dialog"
      class="dialog-card insufficient-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="insufficient-dialog-title"
      tabindex="-1"
      @keydown="keydown"
    >
      <header class="insufficient-dialog-header">
        <div>
          <h2 id="insufficient-dialog-title">{{ $t('Credit 余额不足') }}</h2>
          <p>{{ $t('本次操作未执行，补充额度后可继续使用。') }}</p>
        </div>
        <button class="icon-button" type="button" :aria-label="$t('关闭')" @click="dismiss">
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <div class="insufficient-balance-list">
        <p>
          <span>{{ $t('本周免费') }}</span>
          <span>{{ detail.weeklyFree }} Credits（{{ detail.weeklyFree > 0 ? $t('剩余') : $t('已用完') }}）</span>
        </p>
        <p>
          <span>{{ $t('付费余额') }}</span>
          <span>{{ detail.creditBalance }} Credits</span>
        </p>
        <p>
          <span>{{ $t('本次操作预计消耗') }}</span>
          <span>{{ detail.estimated }} Credits</span>
        </p>
      </div>

      <div class="insufficient-options">
        <p>{{ $t('你可以：') }}</p>
        <ul>
          <li>{{ $t('购买周付补充包（¥9.90 快速到账）') }}</li>
          <li>{{ $t('升级到月付套餐（¥29.90 更划算）') }}</li>
          <li>{{ $t('等待下周一免费额度刷新') }}</li>
        </ul>
      </div>

      <div class="insufficient-actions">
        <button class="secondary-button" type="button" data-insufficient-initial-focus @click="dismiss">
          {{ $t('取消') }}
        </button>
        <button class="primary-button" type="button" @click="goPurchase">
          {{ $t('去购买') }}
        </button>
      </div>
    </section>
  </div>
</template>

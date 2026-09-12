<script setup lang="ts">
import { FileText, ShieldCheck } from "@lucide/vue";
import { computed, nextTick, onMounted, ref } from "vue";

import type { PrivacyGateState } from "@desktop/types";
import { PRIVACY_POLICY_CONTENT } from "../../../../privacy/policy.js";

const props = defineProps<{
  state: PrivacyGateState | undefined;
  busy: boolean;
  error: string | undefined;
  authenticated: boolean;
}>();
const emit = defineEmits<{
  agree: [];
  decline: [];
  logout: [];
  exportLocal: [];
}>();
const fullOpen = ref(false);
const dialog = ref<HTMLElement>();
const fullText = ref<HTMLElement>();
const policyVersion = computed(() => props.state?.policy?.policyVersion ?? "privacy-2026-09-08-v1");

onMounted(() => {
  dialog.value?.querySelector<HTMLElement>("[data-privacy-initial-focus]")?.focus();
});

async function expandFullText(): Promise<void> {
  fullOpen.value = true;
  await nextTick();
  fullText.value?.focus();
}

function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
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
  <div class="login-screen">
    <section
      ref="dialog"
      class="privacy-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-dialog-title"
      aria-describedby="privacy-dialog-description"
      @keydown="keydown"
    >
      <header class="privacy-heading">
        <div class="privacy-icon" aria-hidden="true">
          <ShieldCheck :size="20" :stroke-width="1.8" />
        </div>
        <div>
          <h1 id="privacy-dialog-title">{{ $t('隐私知情同意') }}</h1>
          <p id="privacy-dialog-description">{{ $t('在使用 Coolto 之前，请先了解我们如何处理你的数据。') }}</p>
          <p class="privacy-policy-version">{{ $t('政策版本') }}：{{ policyVersion }}</p>
        </div>
      </header>

      <p v-if="state?.error || error" class="form-error" role="alert">
        {{ error ?? state?.error }}
      </p>
      <p v-if="state?.restrictedRecovery" class="form-error" role="alert">
        {{ $t('账号当前处于删除恢复状态，请完成恢复或退出登录。') }}
      </p>

      <div class="privacy-summary">
        <section>
          <h2>{{ $t('数据如何使用') }}</h2>
          <p>{{ $t('LLM 仅在发起任务时处理你提供的经历、JD 与简历内容，用于生成求职材料；不会在任务之外上传业务数据。') }}</p>
        </section>
        <section>
          <h2>{{ $t('数据存储位置') }}</h2>
          <p>{{ $t('经历、JD、简历与投递记录加密保存在本机与 Coolto 云端服务；对话记录仅保存在本机。') }}</p>
        </section>
        <section>
          <h2>{{ $t('你的权利') }}</h2>
          <p>{{ $t('你可以随时在「设置 → 隐私与数据」查看数据说明、导出内容并清除本地数据。') }}</p>
        </section>
      </div>

      <details v-if="fullOpen" class="privacy-full" open>
        <summary>{{ $t('隐私政策全文') }}</summary>
        <div ref="fullText" tabindex="-1" class="privacy-full-text">
          <p v-for="paragraph in PRIVACY_POLICY_CONTENT" :key="paragraph">{{ $t(paragraph) }}</p>
        </div>
      </details>

      <div class="privacy-actions">
        <button
          v-if="!fullOpen"
          class="privacy-link-button"
          type="button"
          @click="expandFullText"
        >
          <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ $t('查看隐私政策全文') }}</span>
        </button>
        <div class="privacy-action-group">
          <button
            v-if="authenticated && state?.localAccepted && !(state.available && state.consent?.status === 'accepted')"
            class="secondary-button"
            type="button"
            @click="emit('exportLocal')"
          >
            {{ $t('导出本机数据') }}
          </button>
          <button
            v-if="authenticated"
            class="privacy-link-button"
            type="button"
            :disabled="busy"
            @click="emit('logout')"
          >
            {{ $t('退出登录') }}
          </button>
          <button
            class="privacy-link-button danger-text"
            type="button"
            :disabled="busy || state?.available === false || state?.restrictedRecovery"
            @click="emit('decline')"
          >
            {{ $t('不同意') }}
          </button>
          <button
            class="primary-button privacy-agree"
            type="button"
            data-privacy-initial-focus
            :disabled="busy || state?.available === false || state?.restrictedRecovery"
            @click="emit('agree')"
          >
            {{ busy ? $t('请稍候…') : $t('同意并继续') }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

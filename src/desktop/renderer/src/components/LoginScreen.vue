<script setup lang="ts">
import { ArrowRight } from "@lucide/vue";
import { onBeforeUnmount, ref, watch } from "vue";

import type { EmailChallengeView } from "@desktop/types";

const props = defineProps<{
  busy: boolean;
  error: string | undefined;
  challenge: EmailChallengeView | undefined;
  firstVisit: boolean;
}>();

const emit = defineEmits<{
  requestCode: [email: string];
  verifyCode: [email: string, challengeId: string, code: string];
}>();

const email = ref("");
const code = ref("");
const retryAfter = ref(0);
let retryTimer: ReturnType<typeof setInterval> | undefined;

watch(
  () => props.challenge?.challengeId,
  () => {
    if (retryTimer) clearInterval(retryTimer);
    retryAfter.value = props.challenge?.retryAfterSeconds ?? 0;
    if (retryAfter.value > 0) {
      retryTimer = setInterval(() => {
        retryAfter.value = Math.max(0, retryAfter.value - 1);
        if (retryAfter.value === 0 && retryTimer) clearInterval(retryTimer);
      }, 1_000);
    }
  },
);

onBeforeUnmount(() => {
  if (retryTimer) clearInterval(retryTimer);
});

function submit(): void {
  const normalizedEmail = email.value.trim();
  if (!normalizedEmail) return;
  if (!props.challenge) {
    emit("requestCode", normalizedEmail);
    return;
  }
  if (/^\d{6}$/u.test(code.value)) {
    emit("verifyCode", normalizedEmail, props.challenge.challengeId, code.value);
  }
}
</script>

<template>
  <main class="login-screen">
    <section class="login-card">
      <div class="login-copy">
        <h1>{{ firstVisit ? $t('欢迎使用 Coolto') : $t('欢迎回到 Coolto') }}</h1>
        <p v-if="firstVisit">{{ $t('我的求职助手：整理经历、分析 JD、生成简历、追踪投递。') }}</p>
        <p v-else>{{ $t('登录后继续使用你的经历、JD 与简历。') }}</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label>
          <span>{{ $t('邮箱') }}</span>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="name@example.com"
            :disabled="busy || Boolean(challenge)"
          />
        </label>
        <label v-if="challenge">
          <span>{{ $t('邮箱验证码') }}</span>
          <input
            v-model="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            maxlength="6"
            :placeholder="$t('6 位验证码')"
            :disabled="busy"
          />
        </label>
        <div v-if="challenge" class="login-hint-row">
          <p class="login-hint">{{ $t('验证码已发送至你的邮箱，请查收。') }}</p>
          <button
            class="login-inline-button"
            type="button"
            :disabled="busy || retryAfter > 0"
            @click="emit('requestCode', email.trim())"
          >
            {{ retryAfter > 0 ? `${retryAfter}s` : $t('重新发送') }}
          </button>
        </div>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button
          class="primary-button icon-label"
          type="submit"
          :disabled="busy || !email.trim() || (Boolean(challenge) && !/^\d{6}$/u.test(code))"
        >
          <span>{{ busy ? $t('请稍候…') : challenge ? $t('验证并登录') : $t('获取验证码') }}</span>
          <ArrowRight :size="16" :stroke-width="1.9" aria-hidden="true" />
        </button>
      </form>

      <p class="login-footnote">
        {{ $t('登录状态将安全保存在系统凭据库，验证码和密码均不会保存在本机。') }}
      </p>
    </section>
  </main>
</template>

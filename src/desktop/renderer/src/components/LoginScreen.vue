<script setup lang="ts">
import { ArrowRight } from "@lucide/vue";
import { onBeforeUnmount, ref, watch } from "vue";

import type { EmailChallengeView } from "@desktop/types";

const props = defineProps<{
  busy: boolean;
  error: string | undefined;
  challenge: EmailChallengeView | undefined;
}>();

const emit = defineEmits<{
  requestCode: [email: string];
  verifyCode: [email: string, challengeId: string, code: string];
  passwordLogin: [email: string, password: string];
}>();

const mode = ref<"otp" | "password">("otp");
const email = ref("");
const code = ref("");
const password = ref("");
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
  if (mode.value === "password") {
    if (password.value) emit("passwordLogin", normalizedEmail, password.value);
    return;
  }
  if (!props.challenge) {
    emit("requestCode", normalizedEmail);
    return;
  }
  if (/^\d{6}$/u.test(code.value)) {
    emit("verifyCode", normalizedEmail, props.challenge.challengeId, code.value);
  }
}

function switchMode(): void {
  mode.value = mode.value === "otp" ? "password" : "otp";
}
</script>

<template>
  <main class="login-screen">
    <section class="login-card">
      <div class="login-copy">
        <h1>{{ $t('欢迎回到 Coolto') }}</h1>
        <p>{{ $t('登录后继续使用你的经历、JD 与简历。') }}</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label>
          <span>{{ $t('邮箱') }}</span>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="name@example.com"
            :disabled="busy || (mode === 'otp' && Boolean(challenge))"
          />
        </label>
        <label v-if="mode === 'otp' && challenge">
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
        <label v-else-if="mode === 'password'">
          <span>{{ $t('开发密码') }}</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            :placeholder="$t('请输入开发密码')"
            :disabled="busy"
          />
        </label>
        <div v-if="challenge && mode === 'otp'" class="login-hint-row">
          <p class="login-hint">{{ $t('验证码已发送；本地开发可在 Mailpit 查看。') }}</p>
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
          :disabled="busy || !email.trim() || (mode === 'password' ? !password : Boolean(challenge) && !/^\d{6}$/u.test(code))"
        >
          <span>{{ busy ? $t('请稍候…') : mode === "password" ? $t('开发登录') : challenge ? $t('验证并登录') : $t('获取验证码') }}</span>
          <ArrowRight :size="16" :stroke-width="1.9" aria-hidden="true" />
        </button>
        <button class="login-mode-button" type="button" :disabled="busy" @click="switchMode">
          {{ mode === "otp" ? $t('使用开发密码登录') : $t('使用邮箱验证码登录') }}
        </button>
      </form>

      <p class="login-footnote">
        {{ $t('登录状态将安全保存在系统凭据库，验证码和密码均不会保存在本机。') }}
      </p>
    </section>
  </main>
</template>

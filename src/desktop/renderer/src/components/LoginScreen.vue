<script setup lang="ts">
import { ArrowRight } from "@lucide/vue";
import { ref } from "vue";

defineProps<{
  busy: boolean;
  error: string | undefined;
}>();

const emit = defineEmits<{
  submit: [email: string, password: string];
}>();

const email = ref("");
const password = ref("");

function submit(): void {
  if (email.value.trim() && password.value) {
    emit("submit", email.value.trim(), password.value);
  }
}
</script>

<template>
  <main class="login-screen">
    <section class="login-card">
      <div class="login-copy">
        <h1>欢迎回到 Coolto</h1>
        <p>登录后继续使用你的经历、JD 与简历。</p>
      </div>

      <form class="login-form" @submit.prevent="submit">
        <label>
          <span>邮箱</span>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            placeholder="name@example.com"
            :disabled="busy"
          />
        </label>
        <label>
          <span>密码</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            :disabled="busy"
          />
        </label>
        <p v-if="error" class="form-error">{{ error }}</p>
        <button
          class="primary-button icon-label"
          type="submit"
          :disabled="busy || !email.trim() || !password"
        >
          <span>{{ busy ? "正在登录…" : "登录" }}</span>
          <ArrowRight :size="16" :stroke-width="1.9" aria-hidden="true" />
        </button>
      </form>

      <p class="login-footnote">
        登录状态将安全保存在系统凭据库，密码不会保存在本机。
      </p>
    </section>
  </main>
</template>

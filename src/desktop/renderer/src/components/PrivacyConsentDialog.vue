<script setup lang="ts">
import { FileText, ShieldCheck } from "@lucide/vue";
import { nextTick, onMounted, ref } from "vue";

const emit = defineEmits<{
  agree: [];
}>();
const fullOpen = ref(false);
const dialog = ref<HTMLElement>();
const fullText = ref<HTMLElement>();

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
      @keydown="keydown"
    >
      <header class="privacy-heading">
        <div class="privacy-icon" aria-hidden="true">
          <ShieldCheck :size="20" :stroke-width="1.8" />
        </div>
        <div>
          <h1 id="privacy-dialog-title">{{ $t('隐私知情同意') }}</h1>
          <p>{{ $t('在使用 Coolto 之前，请先了解我们如何处理你的数据。') }}</p>
        </div>
      </header>

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
          <p>{{ $t('1. Coolto 仅在用户主动发起任务时，将任务相关的经历、JD、简历内容发送给大语言模型处理。') }}</p>
          <p>{{ $t('2. 业务数据（经历、JD、简历、投递记录）加密存储在用户本地及 Coolto 云端服务；对话与临时分析仅保存在本机，不写入云端。') }}</p>
          <p>{{ $t('3. 登录凭证保存在系统凭据库，验证码与密码不会以明文保存在本机。') }}</p>
          <p>{{ $t('4. 用户有权查看数据使用说明、导出自己的内容，并在「设置 → 隐私与数据」中清除本地数据。') }}</p>
          <p>{{ $t('5. 不同意本协议将无法使用 Coolto；已同意后可在设置页随时查看。') }}</p>
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
        <button
          class="primary-button privacy-agree"
          type="button"
          data-privacy-initial-focus
          @click="$emit('agree')"
        >
          {{ $t('同意并继续') }}
        </button>
      </div>
    </section>
  </div>
</template>

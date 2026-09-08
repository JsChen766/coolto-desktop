<script setup lang="ts">
const props = defineProps<{ busy: boolean; error?: string | undefined }>();
const emit = defineEmits<{ close: []; confirm: [] }>();

function close(): void {
  if (!props.busy) emit("close");
}
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="close" @keydown.esc="close">
    <section
      class="dialog-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-skip-title"
      aria-describedby="onboarding-skip-description"
    >
      <h2 id="onboarding-skip-title">{{ $t('跳过整个新手引导？') }}</h2>
      <p id="onboarding-skip-description">
        {{ $t('所有示例数据、临时简历和示例浏览器页面都会清理。你的正式账号数据不会受到影响，之后将直接进入 Coolto 首页。') }}
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <div class="dialog-actions">
        <button autofocus class="secondary-button" type="button" :disabled="busy" @click="close">
          {{ $t('继续引导') }}
        </button>
        <button class="primary-button" type="button" :disabled="busy" @click="$emit('confirm')">
          {{ busy ? $t('正在跳过…') : $t('跳过并进入首页') }}
        </button>
      </div>
    </section>
  </div>
</template>

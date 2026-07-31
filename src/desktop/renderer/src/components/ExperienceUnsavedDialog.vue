<script setup lang="ts">
defineEmits<{ stay: []; discard: [] }>();
</script>

<template>
  <div class="dialog-backdrop">
    <section
      class="dialog-card experience-unsaved-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('放弃未保存修改')"
    >
      <h2>{{ $t('放弃未保存的修改？') }}</h2>
      <p>{{ $t('当前表单内容尚未进入确认步骤，离开后这些修改会丢失。') }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" @click="$emit('stay')">
          {{ $t('继续编辑') }}
        </button>
        <button class="primary-button danger" type="button" @click="$emit('discard')">
          {{ $t('放弃修改') }}
        </button>
      </div>
    </section>
  </div>
</template>

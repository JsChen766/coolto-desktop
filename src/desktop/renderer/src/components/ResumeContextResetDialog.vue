<script setup lang="ts">
defineProps<{ title: string; busy: boolean }>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section
      class="dialog-card"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('清空聊天上下文')"
    >
      <h2>{{ $t('开始新的空白对话？') }}</h2>
      <p>
        {{ $tf('当前对话记录会保留，右侧“{title}”及其本地内容不会改变。新对话仍会关联这份简历。', { title }) }}
      </p>
      <div class="dialog-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="busy"
          @click="$emit('close')"
        >
          {{ $t('取消') }}
        </button>
        <button
          class="primary-button"
          type="button"
          :disabled="busy"
          @click="$emit('confirm')"
        >
          {{ busy ? $t('正在创建…') : $t('开始新对话') }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string }>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section
      class="dialog-card"
      role="dialog"
      aria-modal="true"
      aria-label="创建本地简历工作副本"
    >
      <h2>创建本地工作副本？</h2>
      <p>
        “{{ title }}”当前是云端只读版本。确认后，Coolto 会基于它关联的真实 JD
        与来源经历重建本地可编辑副本；不会覆盖云端简历。缺少必要来源时会继续向你确认。
      </p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" @click="$emit('close')">
          取消
        </button>
        <button class="primary-button" type="button" @click="$emit('confirm')">
          确认创建
        </button>
      </div>
    </section>
  </div>
</template>

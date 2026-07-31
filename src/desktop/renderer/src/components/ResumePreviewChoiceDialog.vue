<script setup lang="ts">
import type { ResumeLibraryEntry } from "@desktop/types";

defineProps<{ entry: ResumeLibraryEntry }>();
defineEmits<{ close: []; local: []; cloud: [] }>();
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section
      class="dialog-card"
      role="dialog"
      aria-modal="true"
      :aria-label="$t('选择简历预览版本')"
    >
      <h2>{{ $t('选择预览版本') }}</h2>
      <p>{{ $tf('“{title}”的本地与云端内容存在冲突，请明确选择本次要查看的版本。', { title: entry.displayTitle }) }}</p>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" @click="$emit('close')">
          {{ $t('取消') }}
        </button>
        <button class="secondary-button" type="button" @click="$emit('cloud')">
          {{ $t('预览云端版本') }}
        </button>
        <button class="primary-button" type="button" @click="$emit('local')">
          {{ $t('预览本地版本') }}
        </button>
      </div>
    </section>
  </div>
</template>

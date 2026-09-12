<script setup lang="ts">
import { AlertTriangle } from "@lucide/vue";

import type { MaterialDeleteImpact } from "@desktop/types/material";

defineProps<{ impact: MaterialDeleteImpact; busy?: boolean }>();
const emit = defineEmits<{ cancel: []; confirm: [] }>();
</script>

<template>
  <section class="material-impact-preview" role="dialog" aria-modal="true" aria-labelledby="material-impact-title">
    <div class="material-section-heading"><AlertTriangle :size="17" aria-hidden="true" /><h2 id="material-impact-title">{{ $t('确认删除本地材料？') }}</h2></div>
    <p>{{ $t('取消不会产生任何变化；删除不会修改已发布的简历、投递或历史记录。') }}</p>
    <ul v-if="impact.affectedExperiences.length"><li v-for="item in impact.affectedExperiences" :key="item.experienceId">{{ item.experienceId }} · {{ item.citationCount }} {{ $t('条引用') }}</li></ul>
    <p v-else class="material-muted">{{ $t('没有已确认的经历引用。') }}</p>
    <div class="material-action-row">
      <button class="secondary-button" type="button" :disabled="busy" @click="emit('cancel')">{{ $t('取消') }}</button>
      <button class="primary-button" type="button" :disabled="busy" @click="emit('confirm')">{{ busy ? $t('正在删除…') : $t('确认删除') }}</button>
    </div>
  </section>
</template>

<style scoped>
.material-impact-preview { display: grid; gap: 12px; max-width: 480px; padding: 20px; border: 1px solid var(--border); border-radius: 14px; background: var(--bg); box-shadow: var(--shadow-menu); }
.material-section-heading, .material-action-row { display: flex; align-items: center; gap: 8px; }
.material-section-heading h2 { margin: 0; font-size: 15px; }
.material-impact-preview p { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.material-impact-preview ul { margin: 0; padding-left: 18px; color: var(--text-soft); font-size: 12px; }
.material-action-row { justify-content: flex-end; }
.material-muted { color: var(--muted); }
</style>

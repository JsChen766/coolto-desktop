<script setup lang="ts">
import { AlertTriangle, CheckCircle2 } from "@lucide/vue";
import { ref } from "vue";

import type { MaterialView } from "@desktop/types/material";

defineProps<{ material: MaterialView; busy?: boolean }>();
const emit = defineEmits<{ confirm: [text?: string] }>();
const correctedText = ref("");

function confirm(): void {
  emit("confirm", correctedText.value.trim() || undefined);
}
</script>

<template>
  <section class="material-ocr-review" aria-labelledby="material-ocr-title">
    <header>
      <div class="material-section-heading">
        <AlertTriangle v-if="material.needsUserConfirmation" :size="16" aria-hidden="true" />
        <CheckCircle2 v-else :size="16" aria-hidden="true" />
        <h3 id="material-ocr-title">{{ material.needsUserConfirmation ? $t('OCR 需要确认') : $t('OCR 已完成') }}</h3>
      </div>
      <span v-if="material.ocrConfidence !== null" class="material-confidence">
        {{ $t('置信度') }} {{ Math.round(material.ocrConfidence * 100) }}%
      </span>
    </header>
    <p v-if="material.needsUserConfirmation" class="material-review-note">
      {{ $t('低置信片段在确认前不会作为可靠事实进入经历、简历或面试。') }}
    </p>
    <textarea
      v-if="material.needsUserConfirmation"
      v-model="correctedText"
      class="material-review-editor"
      :placeholder="$t('可选：修正 OCR 文本后再确认')"
      :aria-label="$t('修正 OCR 文本')"
    />
    <button
      class="secondary-button"
      type="button"
      :disabled="busy || !material.needsUserConfirmation"
      @click="confirm"
    >
      {{ busy ? $t('正在保存…') : $t('确认 OCR 结果') }}
    </button>
  </section>
</template>

<style scoped>
.material-ocr-review { display: grid; gap: 10px; padding: 14px 0; border-top: 1px solid var(--border); }
.material-ocr-review header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.material-section-heading { display: flex; align-items: center; gap: 7px; }
.material-section-heading h3 { margin: 0; font-size: 13px; }
.material-confidence { color: var(--muted); font-size: 11px; }
.material-review-note { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.material-review-editor { min-height: 90px; padding: 9px 10px; border: 1px solid var(--border); border-radius: 9px; background: var(--bg); color: var(--text); resize: vertical; }
.material-review-editor:focus-visible { outline: 2px solid var(--text); outline-offset: 2px; }
</style>

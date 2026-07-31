<script setup lang="ts">
import { ChevronDown, ChevronUp, RotateCcw } from "@lucide/vue";
import { ref } from "vue";

import type { ExperienceRevision } from "@desktop/types";
import { experienceRevisionSourceLabel } from "../../../../experience/history-model";
import { localeCode, translate } from "../i18n/locale";

defineProps<{
  revision: ExperienceRevision;
  label?: string | undefined;
  pending?: boolean;
  restoreDisabled?: string | undefined;
}>();
defineEmits<{ restore: [revision: ExperienceRevision] }>();
const expanded = ref(false);

function formatDate(value: string): string {
  return new Date(value).toLocaleString(localeCode(), {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
</script>

<template>
  <article class="experience-revision-item" :class="{ pending }">
    <header>
      <div>
        <strong v-if="label">{{ label }}</strong>
        <time :datetime="revision.createdAt">{{ formatDate(revision.createdAt) }}</time>
        <span>{{ translate(experienceRevisionSourceLabel(revision.source)) }}</span>
      </div>
      <button
        type="button"
        class="experience-revision-expand"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? $t('收起') : $t('展开') }}
        <ChevronUp v-if="expanded" :size="14" aria-hidden="true" />
        <ChevronDown v-else :size="14" aria-hidden="true" />
      </button>
    </header>
    <p class="experience-revision-content" :class="{ expanded }">
      {{ revision.content }}
    </p>
    <footer v-if="!pending">
      <button
        class="secondary-button icon-label"
        type="button"
        :disabled="Boolean(restoreDisabled)"
        :title="restoreDisabled"
        @click="$emit('restore', revision)"
      >
        <RotateCcw :size="14" :stroke-width="1.8" aria-hidden="true" />
        {{ restoreDisabled || $t('恢复为当前正文') }}
      </button>
    </footer>
  </article>
</template>

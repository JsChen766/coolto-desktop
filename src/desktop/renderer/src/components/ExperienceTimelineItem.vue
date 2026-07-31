<script setup lang="ts">
import type { ExperienceSummary } from "@desktop/types";
import { computed } from "vue";
import {
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_SYNC_LABELS,
  experienceDateRange,
  experienceSubtitle,
} from "../../../../experience/timeline-labels";
import { translateDateRange, translateFormat } from "../i18n/locale";
import { experienceMatchContext } from "../../../../experience/timeline-model";
import ExperienceHighlightedText from "./ExperienceHighlightedText.vue";

const props = defineProps<{
  experience: ExperienceSummary;
  selected: boolean;
  highlighted: boolean;
  query: string;
}>();
defineEmits<{ select: [experienceId: string] }>();

const subtitle = computed(() => experienceSubtitle(props.experience));
const context = computed(() => {
  const value = experienceMatchContext(props.experience, props.query);
  if (value?.startsWith("地点：")) {
    return translateFormat("地点：{value}", { value: value.slice(3) });
  }
  if (value?.startsWith("标签：")) {
    return translateFormat("标签：{value}", { value: value.slice(3) });
  }
  return value;
});
</script>

<template>
  <button
    class="experience-timeline-item"
    :class="{
      active: selected,
      archived: experience.status === 'archived',
      'import-highlight': highlighted,
    }"
    type="button"
    :aria-current="selected ? 'true' : undefined"
    @click="$emit('select', experience.id)"
  >
    <span class="experience-timeline-date">{{ translateDateRange(experienceDateRange(experience)) }}</span>
    <span class="experience-timeline-marker" aria-hidden="true"><i /></span>
    <span class="experience-timeline-copy">
      <strong><ExperienceHighlightedText :text="experience.title" :query="query" /></strong>
      <span v-if="subtitle" class="experience-timeline-subtitle">
        <ExperienceHighlightedText :text="subtitle" :query="query" />
      </span>
      <span class="experience-timeline-meta">
        {{ $t(EXPERIENCE_CATEGORY_LABELS[experience.category]) }}
        <span
          v-if="experience.syncStatus && experience.syncStatus !== 'clean'"
          class="experience-sync-label"
          :class="experience.syncStatus"
        >
          {{ $t(EXPERIENCE_SYNC_LABELS[experience.syncStatus]) }}
        </span>
      </span>
      <small v-if="context" class="experience-match-context">
        <ExperienceHighlightedText :text="context" :query="query" />
      </small>
    </span>
  </button>
</template>

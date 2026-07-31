<script setup lang="ts">
import type { ExperienceTimelineGroup } from "../../../../experience/timeline-model";
import ExperienceTimelineItem from "./ExperienceTimelineItem.vue";

defineProps<{
  groups: ExperienceTimelineGroup[];
  selectedId: string | undefined;
  highlightedIds?: string[];
  query: string;
  emptyLabel: string;
}>();
defineEmits<{ select: [experienceId: string] }>();
</script>

<template>
  <div class="experience-timeline" :aria-label="$t('经历时间线')">
    <section v-for="group in groups" :key="group.key" class="experience-year-group">
      <h2>{{ $t(group.label) }}</h2>
      <div class="experience-year-items">
        <ExperienceTimelineItem
          v-for="experience in group.items"
          :key="experience.id"
          :experience="experience"
          :selected="selectedId === experience.id"
          :highlighted="Boolean(highlightedIds?.includes(experience.id))"
          :query="query"
          @select="$emit('select', $event)"
        />
      </div>
    </section>
    <p v-if="!groups.length" class="experience-list-empty">{{ emptyLabel }}</p>
  </div>
</template>

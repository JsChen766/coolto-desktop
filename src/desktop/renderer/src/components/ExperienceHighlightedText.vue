<script setup lang="ts">
import { computed } from "vue";

import { highlightExperienceText } from "../../../../experience/text-highlight";

const props = defineProps<{ text: string; query: string }>();
const parts = computed(() => highlightExperienceText(props.text, props.query));
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <mark v-if="part.match">{{ part.text }}</mark>
    <template v-else>{{ part.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { ChevronDown } from "@lucide/vue";
import { computed, ref } from "vue";

import type { ApplicationStatus } from "@desktop/types";
import { allowedApplicationTransitions } from "../../../../tracker/application-status";
import { transitionLabel } from "../tracker/application-labels";

const props = defineProps<{
  status: ApplicationStatus;
  compact?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  select: [status: ApplicationStatus];
}>();

const open = ref(false);
const transitions = computed(() => allowedApplicationTransitions(props.status));

function select(status: ApplicationStatus): void {
  open.value = false;
  emit("select", status);
}
</script>

<template>
  <div v-if="transitions.length" class="tracker-status-menu" @click.stop>
    <button
      class="tracker-status-trigger"
      :class="{ compact }"
      type="button"
      :disabled="disabled"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span>{{ $t('推进状态') }}</span>
      <ChevronDown :size="13" :stroke-width="1.8" aria-hidden="true" />
    </button>
    <div v-if="open" class="tracker-status-popover popover">
      <button
        v-for="target in transitions"
        :key="target"
        type="button"
        @click="select(target)"
      >
        {{ transitionLabel(status, target) }}
      </button>
    </div>
  </div>
</template>

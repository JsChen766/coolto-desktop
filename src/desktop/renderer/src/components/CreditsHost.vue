<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import type { DesktopApi, DesktopUser } from "@desktop/types";

import CreditDialog from "./CreditDialog.vue";
import InsufficientCreditsDialog from "./InsufficientCreditsDialog.vue";
import { useCreditShell } from "../credits/use-credit-shell.js";

const props = defineProps<{
  api: DesktopApi;
  user: DesktopUser | undefined;
}>();

const userRef = computed(() => props.user);
const {
  totalCredits,
  unlimited,
  insufficientDetail,
  handleAgentEvent,
  clearInsufficient,
} = useCreditShell(props.api, userRef);
const creditOpen = ref(false);

let unsubscribe: (() => void) | undefined;
onMounted(() => {
  unsubscribe = props.api.agent.onEvent(handleAgentEvent);
});
onUnmounted(() => {
  unsubscribe?.();
});

function open(): void {
  creditOpen.value = true;
}

function goPurchase(): void {
  clearInsufficient();
  creditOpen.value = true;
}

defineExpose({ totalCredits, unlimited, open });
</script>

<template>
  <CreditDialog v-if="creditOpen" :api="api" @close="creditOpen = false" />
  <InsufficientCreditsDialog
    v-if="insufficientDetail"
    :detail="insufficientDetail"
    @close="clearInsufficient"
    @go-purchase="goPurchase"
  />
</template>

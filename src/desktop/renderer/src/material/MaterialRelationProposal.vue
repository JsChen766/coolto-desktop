<script setup lang="ts">
import { computed } from "vue";
import { GitBranch } from "@lucide/vue";

import type { MaterialRelationProposalView } from "@desktop/types/material";

const props = defineProps<{ proposal: MaterialRelationProposalView; busy?: boolean }>();
const emit = defineEmits<{ approve: []; reject: [] }>();
const canDecide = computed(() => props.proposal.status === "pending");
</script>

<template>
  <section class="material-relation-proposal" aria-labelledby="material-relation-title">
    <header>
      <div class="material-section-heading"><GitBranch :size="16" aria-hidden="true" /><h3 id="material-relation-title">{{ $t('材料关系提案') }}</h3></div>
      <span>{{ proposal.status }}</span>
    </header>
    <p>{{ $t('这只会写入明确的引用关系，不会复制整份材料正文。') }}</p>
    <p v-if="proposal.status === 'needs_user_decision'">{{ $t('宿主写入结果需要确认；为避免重复写入，此提案已暂停。') }}</p>
    <ul><li v-for="experienceId in proposal.experienceIds" :key="experienceId">{{ experienceId }}</li></ul>
    <div class="material-action-row">
      <button class="secondary-button" type="button" :disabled="busy || !canDecide" @click="emit('reject')">{{ $t('拒绝') }}</button>
      <button class="primary-button" type="button" :disabled="busy || !canDecide" @click="emit('approve')">{{ busy ? $t('正在保存…') : $t('确认关系') }}</button>
    </div>
  </section>
</template>

<style scoped>
.material-relation-proposal { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--border); border-radius: 12px; }
.material-relation-proposal header, .material-action-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.material-section-heading { display: flex; align-items: center; gap: 7px; }
.material-section-heading h3 { margin: 0; font-size: 13px; }
.material-relation-proposal header > span, .material-relation-proposal p { color: var(--muted); font-size: 11px; }
.material-relation-proposal p { margin: 0; line-height: 1.45; }
.material-relation-proposal ul { margin: 0; padding-left: 18px; color: var(--text-soft); font-size: 12px; }
</style>

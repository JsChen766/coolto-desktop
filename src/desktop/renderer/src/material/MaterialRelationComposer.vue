<script setup lang="ts">
import { ref } from "vue";

import type {
  MaterialApi,
  MaterialRelationProposalView,
  MaterialView,
} from "@desktop/types/material";
import MaterialRelationProposal from "./MaterialRelationProposal.vue";

const props = defineProps<{ api: MaterialApi; material: MaterialView; busy?: boolean }>();
const emit = defineEmits<{ changed: []; error: [message: string] }>();
const experienceInput = ref("");
const proposal = ref<MaterialRelationProposalView>();
const working = ref(false);

const isBusy = () => Boolean(props.busy || working.value);

async function prepare(): Promise<void> {
  const experienceIds = [...new Set(experienceInput.value.split(/[,\n]/u).map((value) => value.trim()).filter(Boolean))];
  if (!experienceIds.length) {
    emit("error", "请填写至少一个 Experience ID");
    return;
  }
  working.value = true;
  try {
      proposal.value = await props.api.prepareRelation({
        materialId: props.material.materialId,
        classification: "classified",
        experienceReferences: experienceIds.map((experienceId, index) => ({
          experienceId,
          citations: [{ kind: "section", sectionLabel: `材料预览 ${index + 1}` }],
        })),
      });
  } catch (cause: unknown) {
    emit("error", cause instanceof Error ? cause.message : String(cause));
  } finally {
    working.value = false;
  }
}

async function approve(): Promise<void> {
  if (!proposal.value) return;
  await applyProposal(() => props.api.approveRelation(proposal.value!.proposalId));
}

async function reject(): Promise<void> {
  if (!proposal.value) return;
  working.value = true;
  try {
    await props.api.rejectRelation(proposal.value.proposalId);
    proposal.value = { ...proposal.value, status: "rejected" };
    emit("changed");
  } catch (cause: unknown) {
    emit("error", cause instanceof Error ? cause.message : String(cause));
  } finally {
    working.value = false;
  }
}

async function applyProposal(action: () => Promise<MaterialRelationProposalView>): Promise<void> {
  working.value = true;
  try {
    proposal.value = await action();
    emit("changed");
  } catch (cause: unknown) {
    emit("error", cause instanceof Error ? cause.message : String(cause));
  } finally {
    working.value = false;
  }
}
</script>

<template>
  <section class="material-relation-composer" aria-labelledby="material-relation-composer-title">
    <h3 id="material-relation-composer-title">{{ $t('建立 Experience 关系') }}</h3>
    <p>{{ $t('关系只保存引用位置，不复制材料正文。多个 ID 用逗号或换行分隔。') }}</p>
    <label>
      <span>{{ $t('Experience ID') }}</span>
      <textarea v-model="experienceInput" rows="2" :disabled="isBusy()" :placeholder="$t('例如：experience-…')" />
    </label>
    <button class="secondary-button" type="button" :disabled="isBusy()" @click="prepare">{{ $t('生成关系提案') }}</button>
    <MaterialRelationProposal v-if="proposal" :proposal="proposal" :busy="isBusy()" @approve="approve" @reject="reject" />
  </section>
</template>

<style scoped>
.material-relation-composer { display: grid; gap: 9px; padding: 14px 0; border-top: 1px solid var(--border); }
.material-relation-composer h3 { margin: 0; font-size: 12px; }
.material-relation-composer p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
.material-relation-composer label { display: grid; gap: 5px; color: var(--muted); font-size: 11px; }
.material-relation-composer textarea { width: 100%; min-height: 54px; resize: vertical; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; padding: 8px; background: var(--bg); color: var(--text); font: inherit; }
</style>

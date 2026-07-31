<script setup lang="ts">
import type { TrackerChildProposal } from "@desktop/types";
import { CHILD_LABELS, MUTATION_LABELS } from "../tracker/tracker-child-labels";
defineProps<{ proposal: TrackerChildProposal; busy?: boolean; error?: string | undefined }>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section class="dialog-card tracker-child-proposal" role="dialog" aria-modal="true" :aria-label="$t('确认 Tracker 修改')">
      <h2>{{ $tf('确认{mutation}{kind}？', { mutation: MUTATION_LABELS[proposal.mutation], kind: CHILD_LABELS[proposal.entityKind] }) }}</h2>
      <p>{{ $t('确认后将先保存到本机并进入同步队列；离线时仍可立即查看。') }}</p>
      <dl><div><dt>{{ $t('记录类型') }}</dt><dd>{{ CHILD_LABELS[proposal.entityKind] }}</dd></div><div><dt>{{ $t('操作') }}</dt><dd>{{ MUTATION_LABELS[proposal.mutation] }}</dd></div><div><dt>{{ $t('准备时间') }}</dt><dd>{{ new Date(proposal.preparedAt).toLocaleString($locale()) }}</dd></div></dl>
      <p v-if="proposal.mutation === 'delete'">{{ $t('删除不会影响所属 Application；删除 Application 时则会统一清理其全部子记录。') }}</p>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions"><button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">{{ $t('返回检查') }}</button><button class="primary-button" :class="{ danger: proposal.mutation === 'delete' }" type="button" :disabled="busy" @click="$emit('confirm')">{{ busy ? $t('正在保存…') : $t('确认并保存') }}</button></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { TrackerChildProposal } from "@desktop/types";
import { CHILD_LABELS, MUTATION_LABELS } from "../tracker/tracker-child-labels";
defineProps<{ proposal: TrackerChildProposal; busy?: boolean; error?: string | undefined }>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section class="dialog-card tracker-child-proposal" role="dialog" aria-modal="true" aria-label="确认 Tracker 修改">
      <h2>确认{{ MUTATION_LABELS[proposal.mutation] }}{{ CHILD_LABELS[proposal.entityKind] }}？</h2>
      <p>确认后将先保存到本机并进入同步队列；离线时仍可立即查看。</p>
      <dl><div><dt>记录类型</dt><dd>{{ CHILD_LABELS[proposal.entityKind] }}</dd></div><div><dt>操作</dt><dd>{{ MUTATION_LABELS[proposal.mutation] }}</dd></div><div><dt>准备时间</dt><dd>{{ new Date(proposal.preparedAt).toLocaleString('zh-CN') }}</dd></div></dl>
      <p v-if="proposal.mutation === 'delete'">删除不会影响所属 Application；删除 Application 时则会统一清理其全部子记录。</p>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions"><button class="secondary-button" type="button" :disabled="busy" @click="$emit('close')">返回检查</button><button class="primary-button" :class="{ danger: proposal.mutation === 'delete' }" type="button" :disabled="busy" @click="$emit('confirm')">{{ busy ? '正在保存…' : '确认并保存' }}</button></div>
    </section>
  </div>
</template>

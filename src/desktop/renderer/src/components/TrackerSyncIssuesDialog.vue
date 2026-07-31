<script setup lang="ts">
import type { TrackerRecoveryProposal, TrackerSyncIssueSummary } from "@desktop/types";
const props = defineProps<{ issues: TrackerSyncIssueSummary[]; proposal?: TrackerRecoveryProposal | undefined; busy?: boolean; error?: string | undefined }>();
defineEmits<{ close: []; prepare: [issue: TrackerSyncIssueSummary, action: "accept_server" | "reapply"]; confirm: []; back: [] }>();
const LABELS = { application: "投递记录", interview_round: "面试", application_note: "笔记", reminder: "提醒" } as const;
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="$emit('close')">
    <section class="dialog-card tracker-sync-issues" role="dialog" aria-modal="true" :aria-label="$t('处理 Tracker 同步问题')">
      <template v-if="proposal">
        <h2>{{ $t('确认处理同步问题？') }}</h2>
        <p>{{ proposal.action === 'accept_server' ? $t('本地修改将被服务端版本替换。') : $t('本地修改将基于最新服务端版本重新提交。') }}</p>
        <p>{{ $tf('对象：{kind}；错误：{error}', { kind: $t(LABELS[proposal.issue.entityType]), error: proposal.issue.errorCode }) }}</p>
      </template>
      <template v-else>
        <h2>{{ $t('Tracker 同步问题') }}</h2>
        <p>{{ $t('这些修改不会静默覆盖服务端内容，请逐项选择处理方式。') }}</p>
        <div class="tracker-sync-issue-list">
          <article v-for="issue in issues" :key="`${issue.entityType}:${issue.entityId}`">
            <div><strong>{{ $t(LABELS[issue.entityType]) }}</strong><span>{{ issue.status === 'conflict' ? $t('同步冲突') : $t('写入失败') }}</span><small>{{ issue.errorCode }}</small></div>
            <nav><button v-if="issue.canReapply" class="secondary-button" type="button" :disabled="busy" @click="$emit('prepare', issue, 'reapply')">{{ $t('重新提交本地修改') }}</button><button class="primary-button" :class="{ danger: issue.serverDeleted }" type="button" :disabled="busy" @click="$emit('prepare', issue, 'accept_server')">{{ issue.serverDeleted ? $t('接受服务端删除') : $t('采用服务端版本') }}</button></nav>
          </article>
        </div>
      </template>
      <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>
      <div class="dialog-actions"><button class="secondary-button" type="button" :disabled="busy" @click="proposal ? $emit('back') : $emit('close')">{{ proposal ? $t('返回列表') : $t('关闭') }}</button><button v-if="proposal" class="primary-button" type="button" :disabled="busy" @click="$emit('confirm')">{{ $t('确认处理') }}</button></div>
    </section>
  </div>
</template>

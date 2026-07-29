<script setup lang="ts">
import type { ApplicationWriteProposal } from "@desktop/types";
import { STATUS_LABELS } from "../tracker/application-labels";

defineProps<{ proposal: ApplicationWriteProposal }>();
</script>

<template>
  <div class="application-proposal-summary">
    <p v-if="proposal.kind === 'relation_correction'" class="application-proposal-notice">
      将直接纠正原投递记录，不会复制或取消记录。
    </p>
    <dl>
      <div><dt>公司 / 岗位</dt><dd>{{ proposal.companyName }} · {{ proposal.roleName }}</dd></div>
      <div v-if="proposal.previousJd">
        <dt>JD 关联</dt><dd>{{ proposal.previousJd.title }} → {{ proposal.jd.title }}</dd>
      </div>
      <div v-else><dt>投递 JD</dt><dd>{{ proposal.jd.title }}</dd></div>
      <div v-if="proposal.previousResume">
        <dt>Resume 关联</dt><dd>{{ proposal.previousResume.title }} → {{ proposal.resume.title }}</dd>
      </div>
      <div v-else><dt>实际 Resume</dt><dd>{{ proposal.resume.title }}</dd></div>
      <div>
        <dt>内容指纹</dt>
        <dd><code>{{ proposal.resumeContentHashSnapshot.slice(0, 12) }}…</code></dd>
      </div>
    </dl>
    <p v-if="proposal.duplicate" class="application-duplicate-warning">
      同一 JD 与 Resume 已有 {{ proposal.duplicate.count }} 次投递；最近状态为
      {{ STATUS_LABELS[proposal.duplicate.latestStatus] }}，
      {{ proposal.duplicate.latestAppliedAt
        ? new Date(proposal.duplicate.latestAppliedAt).toLocaleString('zh-CN')
        : '时间待确认' }}。仍可继续记录。
    </p>
    <p class="application-proposal-footnote">
      确认后写入本地 Outbox；离线、待同步或冲突状态下也会保留本次确认的内容指纹。
    </p>
  </div>
</template>

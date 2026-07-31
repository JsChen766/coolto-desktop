<script setup lang="ts">
import type { ApplicationWriteProposal } from "@desktop/types";
import { STATUS_LABELS } from "../tracker/application-labels";

defineProps<{ proposal: ApplicationWriteProposal }>();
</script>

<template>
  <div class="application-proposal-summary">
    <p v-if="proposal.kind === 'relation_correction'" class="application-proposal-notice">
      {{ $t('将直接纠正原投递记录，不会复制或取消记录。') }}
    </p>
    <dl>
      <div><dt>{{ $t('公司 / 岗位') }}</dt><dd>{{ proposal.companyName }} · {{ proposal.roleName }}</dd></div>
      <div v-if="proposal.previousJd">
        <dt>{{ $t('JD 关联') }}</dt><dd>{{ proposal.previousJd.title }} → {{ proposal.jd.title }}</dd>
      </div>
      <div v-else><dt>{{ $t('投递 JD') }}</dt><dd>{{ proposal.jd.title }}</dd></div>
      <div v-if="proposal.previousResume">
        <dt>{{ $t('Resume 关联') }}</dt><dd>{{ proposal.previousResume.title }} → {{ proposal.resume.title }}</dd>
      </div>
      <div v-else><dt>{{ $t('实际 Resume') }}</dt><dd>{{ proposal.resume.title }}</dd></div>
      <div>
        <dt>{{ $t('内容指纹') }}</dt>
        <dd><code>{{ proposal.resumeContentHashSnapshot.slice(0, 12) }}…</code></dd>
      </div>
    </dl>
    <p v-if="proposal.duplicate" class="application-duplicate-warning">
      {{ $tf('同一 JD 与 Resume 已有 {count} 次投递；最近状态为 {status}。仍可继续记录。', {
        count: proposal.duplicate.count,
        status: `${STATUS_LABELS[proposal.duplicate.latestStatus]} · ${proposal.duplicate.latestAppliedAt
          ? new Date(proposal.duplicate.latestAppliedAt).toLocaleString($locale())
          : $t('时间待确认')}`,
      }) }}
    </p>
    <p class="application-proposal-footnote">
      {{ $t('确认后写入本地 Outbox；离线、待同步或冲突状态下也会保留本次确认的内容指纹。') }}
    </p>
  </div>
</template>

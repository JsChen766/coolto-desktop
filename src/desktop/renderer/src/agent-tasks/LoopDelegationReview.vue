<script setup lang="ts">
import { ShieldCheck } from "@lucide/vue";
import { computed } from "vue";

import type { AgentTaskProposalView } from "@desktop/types";

const props = defineProps<{ proposal: AgentTaskProposalView }>();
const kind = computed(() => props.proposal.input.jobCriteria.loopKind);
const resumeTitle = computed(() => String(
  props.proposal.input.assetPolicy.resumeTitle ?? "",
));
const sources = computed(() => {
  const value = props.proposal.input.jobCriteria.sources;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => item && typeof item === "object" &&
    !Array.isArray(item) && typeof item.company === "string"
    ? [item.company] : []);
});
const directions = computed(() => {
  const value = props.proposal.input.connectorPolicy?.scheduleMailDirections ??
    props.proposal.input.connectorPolicy?.riskMailDirections;
  if (!Array.isArray(value)) return "";
  return value.map((item) => item === "sent" ? "发件" : "收件").join("、");
});
const scopes: Record<string, string> = {
  resume_job_apply: "读取已选简历、查找岗位、保存 JD、填写页面、逐次确认提交",
  mail_app_schedule: "读取和分类邮件、读取投递候选、逐条确认投递状态与面试日程",
  application_follow_up: "读取当前投递并填写跟进草稿，发送仍由你完成",
  interview_briefing: "读取当前 JD、Resume 与经历，生成有来源的面试简报",
  application_strategy: "聚合投递状态并生成策略 Proposal，不改写业务资产",
  risk_deadline_watch: "读取求职邮件并标记截止或风险，提醒写入前逐条确认",
};
const guards: Record<string, string> = {
  resume_job_apply: "每个岗位提交前都会再次询问，不会批量静默提交。",
  mail_app_schedule: "邮件只用于识别求职事件，Application 与面试日程仍逐条确认。",
  application_follow_up: "Agent 不发送邮件；草稿会停在网页中等待你检查和点击。",
  interview_briefing: "无来源内容不会进入简报，也不会因此写入新的业务事实。",
  application_strategy: "样本不足时不生成结论，相关性不会冒充因果关系。",
  risk_deadline_watch: "风险只显示为需复核，截止提醒不会静默写入 App。",
};
const scopeLabel = computed(() => scopes[String(kind.value)] ?? "仅执行授权中的本地动作");
const guardLabel = computed(() => guards[String(kind.value)] ?? "范围外动作将被阻止。");
const autoStartAfter = computed(() => {
  const value = props.proposal.input.connectorPolicy?.autoStartAfter;
  return typeof value === "string" ? value : "";
});
</script>

<template>
  <section class="loop-review" aria-label="授权范围">
    <header><ShieldCheck :size="18" aria-hidden="true" />
      <div><strong>{{ $t('检查授权范围') }}</strong><span>{{ $t('确认后范围不可静默扩大') }}</span></div>
    </header>
    <dl>
      <div><dt>{{ $t('任务目标') }}</dt><dd>{{ proposal.input.goal }}</dd></div>
      <div v-if="kind === 'resume_job_apply'"><dt>{{ $t('使用简历') }}</dt><dd>{{ resumeTitle }}</dd></div>
      <div v-if="sources.length"><dt>{{ $t('岗位来源') }}</dt><dd>{{ sources.join('、') }}</dd></div>
      <div v-if="directions"><dt>{{ $t('邮件方向') }}</dt><dd>{{ directions }}</dd></div>
      <div><dt>{{ $t('允许站点') }}</dt><dd>{{ proposal.input.allowedDomains.join('、') || $t('仅已连接邮箱') }}</dd></div>
      <div><dt>{{ $t('可执行范围') }}</dt><dd>{{ $t(scopeLabel) }}</dd></div>
      <div><dt>{{ $t('运行条件') }}</dt><dd>{{ $t('仅 App 打开期间') }}</dd></div>
      <div v-if="autoStartAfter"><dt>{{ $t('首次运行') }}</dt><dd>{{ new Date(autoStartAfter).toLocaleString() }}</dd></div>
      <div><dt>{{ $t('有效期至') }}</dt><dd>{{ new Date(proposal.input.expiresAt).toLocaleString() }}</dd></div>
    </dl>
    <p>{{ $t(guardLabel) }}</p>
  </section>
</template>

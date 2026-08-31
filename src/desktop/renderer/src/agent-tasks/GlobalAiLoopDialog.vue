<script setup lang="ts">
import { Radar, ScrollText, X } from "@lucide/vue";
import type { DesktopApi, MailConnectionView } from "@desktop/types";
import LoopDelegationReview from "./LoopDelegationReview.vue";
import { useGlobalAiLoopDialog } from "./use-global-ai-loop-dialog";
import { useLoopDialogFocus } from "./use-loop-dialog-focus";

const props = defineProps<{
  api: DesktopApi; conversationId: string; connections: MailConnectionView[];
  kind: "strategy" | "risk";
}>();
const emit = defineEmits<{ close: []; started: [taskId: string] }>();
const state = useGlobalAiLoopDialog({ ...props, started: (id) => emit("started", id) });
function dismiss(): void { if (!state.busy.value) emit("close"); }
const focus = useLoopDialogFocus(dismiss);
function provider(value: MailConnectionView): string {
  return value.provider === "gmail" ? "Gmail" : "Outlook";
}
</script>

<template>
  <div class="dialog-backdrop loop-dialog-backdrop" @mousedown.self="dismiss">
    <section ref="dialog" class="dialog-card loop-dialog app-scrollbar" role="dialog" aria-modal="true"
      :aria-labelledby="`${kind}-loop-title`" @keydown="focus.keydown">
      <header class="loop-dialog-header"><div><span class="loop-dialog-icon">
        <ScrollText v-if="kind === 'strategy'" :size="17" aria-hidden="true" />
        <Radar v-else :size="17" aria-hidden="true" /></span><div>
          <h2 :id="`${kind}-loop-title`">{{ $t(kind === 'strategy' ? '策略复盘' : '风险与截止监控') }}</h2>
          <p>{{ $t(kind === 'strategy' ? '只基于投递数据提出建议，不自动改写资产。' : '保留邮件原文证据，提醒写入前逐条确认。') }}</p>
        </div></div><button class="icon-button" type="button" :aria-label="$t('关闭')" @click="dismiss"><X :size="17" aria-hidden="true" /></button></header>
      <form v-if="state.stage.value === 'configure'" class="loop-form" @submit.prevent="state.review">
        <label><span>{{ $t('任务目标') }}</span><input v-model="state.form.goal" data-loop-initial-focus required /></label>
        <template v-if="kind === 'strategy'">
          <div class="loop-two-column"><label><span>{{ $t('复盘间隔') }}</span><select v-model="state.form.reviewIntervalDays">
            <option :value="7">{{ $t('每周') }}</option><option :value="14">{{ $t('每 2 周') }}</option><option :value="30">{{ $t('每月') }}</option>
          </select></label><label><span>{{ $t('授权有效期') }}</span><select v-model="state.form.expiryDays"><option :value="30">30 天</option><option :value="90">90 天</option></select></label></div>
          <p class="loop-rule">{{ $t('至少 5 条投递记录才生成建议；相关性不会表述为因果，所有调整仅为 Proposal。') }}</p>
        </template>
        <template v-else>
          <fieldset><legend>{{ $t('邮件来源') }}</legend>
            <label class="loop-check-row"><input v-model="state.form.browserWebmail" type="checkbox" /><span><strong>Browser Webmail</strong><small>{{ $t('读取已授权域名中的收件箱') }}</small></span></label>
            <label v-for="item in connections" :key="item.id" class="loop-check-row"><input type="checkbox" :checked="state.form.mailConnectionIds.includes(item.id)" @change="state.toggleConnection(item.id, ($event.target as HTMLInputElement).checked)" /><span><strong>{{ provider(item) }}</strong><small>{{ item.accountEmail }}</small></span></label>
          </fieldset>
          <label v-if="state.form.browserWebmail"><span>{{ $t('Webmail 域名') }}</span><input v-model="state.form.allowedDomains" :placeholder="$t('例如 mail.example.com')" required /></label>
          <div class="loop-two-column"><label><span>{{ $t('检查间隔') }}</span><select v-model="state.form.pollIntervalMinutes"><option :value="15">15 分钟</option><option :value="60">1 小时</option><option :value="240">4 小时</option></select></label><label><span>{{ $t('授权有效期') }}</span><select v-model="state.form.expiryDays"><option :value="7">7 天</option><option :value="30">30 天</option></select></label></div>
          <p class="loop-rule">{{ $t('风险只标记“需复核”，不会断言诈骗；截止提醒写入 App 前必须确认。') }}</p>
        </template>
      </form>
      <LoopDelegationReview v-else-if="state.proposal.value" :proposal="state.proposal.value" />
      <p v-if="state.error.value" class="form-error" role="alert">{{ state.error.value }}</p>
      <footer class="dialog-actions loop-dialog-actions"><button class="secondary-button" type="button" :disabled="state.busy.value" @click="state.stage.value === 'review' ? state.edit() : dismiss()">{{ $t(state.stage.value === 'review' ? '返回修改' : '暂不创建') }}</button><button class="primary-button" type="button" :disabled="state.busy.value" @click="state.stage.value === 'review' ? state.start() : state.review()">{{ $t(state.busy.value ? '正在处理…' : state.stage.value === 'review' ? '确认并启动任务' : '检查授权') }}</button></footer>
    </section>
  </div>
</template>

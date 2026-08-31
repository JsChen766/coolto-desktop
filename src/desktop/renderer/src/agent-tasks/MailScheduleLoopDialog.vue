<script setup lang="ts">
import { CalendarClock, X } from "@lucide/vue";

import type { DesktopApi, MailConnectionView } from "@desktop/types";
import LoopDelegationReview from "./LoopDelegationReview.vue";
import { useMailScheduleLoopDialog } from "./use-mail-schedule-loop-dialog";
import { useLoopDialogFocus } from "./use-loop-dialog-focus";

const props = defineProps<{
  api: DesktopApi;
  conversationId: string;
  connections: MailConnectionView[];
}>();
const emit = defineEmits<{ close: []; started: [taskId: string] }>();
const state = useMailScheduleLoopDialog({
  api: props.api, conversationId: props.conversationId,
  connections: props.connections, started: (taskId) => emit("started", taskId),
});
function dismiss(): void { if (!state.busy.value) emit("close"); }
const focus = useLoopDialogFocus(dismiss);
function providerLabel(value: MailConnectionView): string {
  return value.provider === "gmail" ? "Gmail" : "Outlook";
}
</script>

<template>
  <div class="dialog-backdrop loop-dialog-backdrop" @mousedown.self="dismiss">
    <section ref="dialog" class="dialog-card loop-dialog app-scrollbar" role="dialog" aria-modal="true"
      aria-labelledby="mail-loop-title" @keydown="focus.keydown">
      <header class="loop-dialog-header">
        <div><span class="loop-dialog-icon"><CalendarClock :size="17" aria-hidden="true" /></span>
          <div><h2 id="mail-loop-title">{{ $t('联动 App 日程') }}</h2>
            <p>{{ $t('识别邮件后生成确认项，不直接改写投递事实。') }}</p></div></div>
        <button class="icon-button" type="button" :aria-label="$t('关闭')" @click="dismiss"><X :size="17" aria-hidden="true" /></button>
      </header>

      <form v-if="state.stage.value === 'configure'" class="loop-form" @submit.prevent="state.review">
        <label><span>{{ $t('任务目标') }}</span><input v-model="state.form.goal" data-loop-initial-focus maxlength="4000" required /></label>
        <fieldset><legend>{{ $t('邮件来源') }}</legend>
          <label class="loop-check-row"><input v-model="state.form.browserWebmail" type="checkbox" />
            <span><strong>Browser Webmail</strong><small>{{ $t('支持当前授权域名中的收件箱和发件箱') }}</small></span></label>
          <label v-for="connection in connections" :key="connection.id" class="loop-check-row">
            <input type="checkbox" :checked="state.form.mailConnectionIds.includes(connection.id)"
              @change="state.toggleConnection(connection.id, ($event.target as HTMLInputElement).checked)" />
            <span><strong>{{ providerLabel(connection) }}</strong><small>{{ connection.accountEmail }}</small></span>
          </label>
          <p v-if="!connections.length" class="loop-field-note">{{ $t('当前没有 Gmail/Outlook 直连，仍可使用 Browser Webmail。') }}</p>
        </fieldset>
        <label v-if="state.form.browserWebmail"><span>{{ $t('Webmail 域名') }}</span>
          <input v-model="state.form.allowedDomains" :placeholder="$t('例如 mail.example.com，多个用逗号分隔')" required /></label>
        <fieldset><legend>{{ $t('识别方向') }}</legend><div class="loop-choice-row">
          <label><input v-model="state.form.received" type="checkbox" />{{ $t('收件') }}</label>
          <label><input v-model="state.form.sent" type="checkbox" :disabled="!state.form.browserWebmail" />{{ $t('发件') }}</label>
        </div></fieldset>
        <div class="loop-two-column">
          <label><span>{{ $t('检查间隔') }}</span><select v-model="state.form.pollIntervalMinutes">
            <option :value="15">{{ $t('每 15 分钟') }}</option><option :value="30">{{ $t('每 30 分钟') }}</option>
            <option :value="60">{{ $t('每小时') }}</option><option :value="240">{{ $t('每 4 小时') }}</option>
          </select></label>
          <label><span>{{ $t('授权有效期') }}</span><select v-model="state.form.expiryDays">
            <option :value="7">{{ $t('7 天') }}</option><option :value="30">{{ $t('30 天') }}</option>
          </select></label>
        </div>
        <p class="loop-rule">{{ $t('固定规则：不申请发送权限；Application 和面试日程始终逐条确认。') }}</p>
      </form>
      <LoopDelegationReview v-else-if="state.proposal.value" :proposal="state.proposal.value" />
      <p v-if="state.error.value" class="form-error" role="alert">{{ state.error.value }}</p>
      <footer class="dialog-actions loop-dialog-actions">
        <button class="secondary-button" type="button" :disabled="state.busy.value" @click="state.stage.value === 'review' ? state.edit() : dismiss()">
          {{ $t(state.stage.value === 'review' ? '返回修改' : '暂不创建') }}</button>
        <button class="primary-button" type="button" :disabled="state.busy.value"
          @click="state.stage.value === 'review' ? state.start() : state.review()">
          {{ $t(state.busy.value ? '正在处理…' : state.stage.value === 'review' ? '确认并启动任务' : '检查授权') }}</button>
      </footer>
    </section>
  </div>
</template>

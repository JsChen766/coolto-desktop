<script setup lang="ts">
import { Clock3, NotebookText, X } from "@lucide/vue";
import type { ApplicationRecord, DesktopApi, InterviewRound } from "@desktop/types";
import LoopDelegationReview from "./LoopDelegationReview.vue";
import { useApplicationLoopDialog } from "./use-application-loop-dialog";
import { useLoopDialogFocus } from "./use-loop-dialog-focus";

const props = defineProps<{
  api: DesktopApi; conversationId: string; application: ApplicationRecord;
  interviews: InterviewRound[]; kind: "follow_up" | "briefing";
}>();
const emit = defineEmits<{ close: []; started: [taskId: string] }>();
const state = useApplicationLoopDialog({ ...props, started: (id) => emit("started", id) });
function dismiss(): void { if (!state.busy.value) emit("close"); }
const focus = useLoopDialogFocus(dismiss);
</script>

<template>
  <div class="dialog-backdrop loop-dialog-backdrop" @mousedown.self="dismiss">
    <section ref="dialog" class="dialog-card loop-dialog app-scrollbar" role="dialog" aria-modal="true"
      :aria-labelledby="`${kind}-loop-title`" @keydown="focus.keydown">
      <header class="loop-dialog-header"><div><span class="loop-dialog-icon">
        <Clock3 v-if="kind === 'follow_up'" :size="17" aria-hidden="true" />
        <NotebookText v-else :size="17" aria-hidden="true" /></span><div>
          <h2 :id="`${kind}-loop-title`">{{ $t(kind === 'follow_up' ? '安排投递跟进' : '准备面试简报') }}</h2>
          <p>{{ application.companyName }} · {{ application.roleName }}</p></div></div>
        <button class="icon-button" type="button" :aria-label="$t('关闭')" @click="dismiss"><X :size="17" aria-hidden="true" /></button>
      </header>
      <form v-if="state.stage.value === 'configure'" class="loop-form" @submit.prevent="state.review">
        <label><span>{{ $t('任务目标') }}</span><input v-model="state.form.goal" data-loop-initial-focus required /></label>
        <label v-if="kind === 'follow_up'"><span>{{ $t('Webmail 域名') }}</span>
          <input v-model="state.form.domains" :placeholder="$t('例如 mail.example.com')" required /></label>
        <label v-else><span>{{ $t('允许研究域名（可选）') }}</span>
          <input v-model="state.form.domains" :placeholder="$t('多个域名用逗号分隔')" /></label>
        <div v-if="kind === 'follow_up'" class="loop-two-column">
          <label><span>{{ $t('检查间隔') }}</span><select v-model="state.form.checkIntervalHours">
            <option :value="24">{{ $t('每天') }}</option><option :value="72">{{ $t('每 3 天') }}</option>
            <option :value="168">{{ $t('每周') }}</option></select></label>
          <label><span>{{ $t('授权有效期') }}</span><select v-model="state.form.expiryDays"><option :value="7">7 天</option><option :value="30">30 天</option></select></label>
        </div>
        <div v-else class="loop-two-column">
          <label><span>{{ $t('面试场次') }}</span><select v-model="state.form.interviewId" required>
            <option v-for="item in state.scheduled" :key="item.id" :value="item.id">{{ $tf('第 {round} 轮', { round: item.roundNumber }) }} · {{ item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : '' }}</option>
          </select></label>
          <label><span>{{ $t('提前准备') }}</span><select v-model="state.form.wakeBeforeMinutes"><option :value="60">1 小时</option><option :value="1440">1 天</option><option :value="4320">3 天</option></select></label>
        </div>
        <p class="loop-rule">{{ $t(kind === 'follow_up' ? '只填写跟进邮件，最终发送由你点击。' : '简报必须引用当前 JD、Resume 或经历，不写入业务事实。') }}</p>
      </form>
      <LoopDelegationReview v-else-if="state.proposal.value" :proposal="state.proposal.value" />
      <p v-if="state.error.value" class="form-error" role="alert">{{ state.error.value }}</p>
      <footer class="dialog-actions loop-dialog-actions"><button class="secondary-button" type="button" :disabled="state.busy.value" @click="state.stage.value === 'review' ? state.edit() : dismiss()">{{ $t(state.stage.value === 'review' ? '返回修改' : '暂不创建') }}</button>
        <button class="primary-button" type="button" :disabled="state.busy.value || (kind === 'briefing' && !state.scheduled.length)" @click="state.stage.value === 'review' ? state.start() : state.review()">{{ $t(state.busy.value ? '正在处理…' : state.stage.value === 'review' ? '确认并启动任务' : '检查授权') }}</button></footer>
    </section>
  </div>
</template>

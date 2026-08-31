<script setup lang="ts">
import { Plus, Search, Trash2, X } from "@lucide/vue";

import type { DesktopApi, JobRepositoryResume } from "@desktop/types";
import LoopDelegationReview from "./LoopDelegationReview.vue";
import { useResumeJobLoopDialog } from "./use-resume-job-loop-dialog";
import { useLoopDialogFocus } from "./use-loop-dialog-focus";

const props = defineProps<{
  api: DesktopApi;
  conversationId: string;
  resume: JobRepositoryResume;
}>();
const emit = defineEmits<{ close: []; started: [taskId: string] }>();
const state = useResumeJobLoopDialog({
  api: props.api, conversationId: props.conversationId, resume: props.resume,
  started: (taskId) => emit("started", taskId),
});
function dismiss(): void { if (!state.busy.value) emit("close"); }
const focus = useLoopDialogFocus(dismiss);
</script>

<template>
  <div class="dialog-backdrop loop-dialog-backdrop" @mousedown.self="dismiss">
    <section ref="dialog" class="dialog-card loop-dialog app-scrollbar" role="dialog" aria-modal="true"
      aria-labelledby="resume-loop-title" @keydown="focus.keydown">
      <header class="loop-dialog-header">
        <div><span class="loop-dialog-icon"><Search :size="17" aria-hidden="true" /></span>
          <div><h2 id="resume-loop-title">{{ $t('用此简历自动找岗') }}</h2>
            <p>{{ $t('先冻结来源和权限，Agent 再开始运行。') }}</p></div></div>
        <button class="icon-button" type="button" :aria-label="$t('关闭')" @click="dismiss"><X :size="17" aria-hidden="true" /></button>
      </header>

      <form v-if="state.stage.value === 'configure'" class="loop-form" @submit.prevent="state.review">
        <div class="loop-locked-asset"><span>{{ $t('已选简历') }}</span><strong>{{ resume.entry.displayTitle }}</strong>
          <small>{{ $t('启动时会再次核对标题和版本') }}</small></div>
        <label><span>{{ $t('任务目标') }}</span><input v-model="state.form.goal" data-loop-initial-focus maxlength="4000" required /></label>
        <fieldset><legend>{{ $t('公开岗位源') }}</legend>
          <div v-for="(source, index) in state.form.sources" :key="index" class="loop-source-row">
            <select v-model="source.provider" :aria-label="$t('岗位源类型')"><option value="greenhouse">Greenhouse</option><option value="lever">Lever</option></select>
            <input v-model="source.company" :placeholder="$t('公司名称')" maxlength="300" required />
            <input v-model="source.sourceKey" placeholder="Source Key" maxlength="100" required />
            <button class="icon-button" type="button" :disabled="state.form.sources.length === 1"
              :aria-label="$t('删除岗位源')" @click="state.removeSource(index)"><Trash2 :size="15" aria-hidden="true" /></button>
          </div>
          <button class="loop-inline-action" type="button" :disabled="state.form.sources.length >= 4" @click="state.addSource">
            <Plus :size="14" aria-hidden="true" />{{ $t('添加岗位源') }}</button>
        </fieldset>
        <label><span>{{ $t('额外申请域名（可选）') }}</span>
          <input v-model="state.form.applicationDomains" :placeholder="$t('例如 careers.company.com，多个用逗号分隔')" /></label>
        <label><span>{{ $t('授权有效期') }}</span><select v-model="state.form.expiryDays">
          <option :value="1">{{ $t('1 天') }}</option><option :value="7">{{ $t('7 天') }}</option><option :value="30">{{ $t('30 天') }}</option>
        </select></label>
        <p class="loop-rule">{{ $t('固定规则：匹配分低于 80 不入选；每个岗位提交前单独确认。') }}</p>
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

<script setup lang="ts">
import {
  Ban, ChevronLeft, ExternalLink, Pause, Play, RotateCcw, ShieldOff, Square, Terminal,
} from "@lucide/vue";
import { computed, shallowRef } from "vue";

import type { AgentTaskDetailView } from "@desktop/types";
import { actionStatusLabel, taskStatusLabel, waitingReasonLabel } from "./agent-task-labels";

const props = defineProps<{
  detail: AgentTaskDetailView;
  busy: string | undefined;
  error: string | undefined;
}>();
const emit = defineEmits<{
  action: [value: "start" | "resume" | "pause" | "cancel" | "revoke"];
  openBrowser: [];
  openConversation: [conversationId: string];
  openLead: [url: string];
  back: [];
}>();
const section = shallowRef<"overview" | "activity" | "receipts" | "grant">("overview");
const sections = [
  { id: "overview" as const, label: "概览" },
  { id: "activity" as const, label: "动态" },
  { id: "receipts" as const, label: "回执" },
  { id: "grant" as const, label: "授权" },
];

const canStart = computed(() => props.detail.task.status === "queued");
const canResume = computed(() => ["waiting", "paused"].includes(props.detail.task.status));
const canPause = computed(() => props.detail.task.status === "running");
const canCancel = computed(() => !["completed", "partially_completed", "canceled", "expired"]
  .includes(props.detail.task.status));
const canRevoke = computed(() => Boolean(props.detail.grant && !props.detail.grant.revokedAt));
const visibleLeads = computed(() => props.detail.leads.slice(0, 12));
</script>

<template>
  <article class="task-inspector">
    <header class="inspector-header">
      <button class="mobile-back" type="button" :aria-label="$t('返回任务列表')" @click="emit('back')">
        <ChevronLeft :size="17" aria-hidden="true" />{{ $t('任务列表') }}
      </button>
      <div class="heading-copy">
        <span class="local-label">{{ $t('仅在 App 打开时运行') }}</span>
        <h1>{{ detail.task.goal }}</h1>
        <p>{{ $t(taskStatusLabel(detail.task.status)) }}<span v-if="detail.task.waitingReason"> · {{ $t(waitingReasonLabel(detail.task.waitingReason)) }}</span></p>
      </div>
      <div class="header-actions">
        <button v-if="canStart" type="button" class="primary-action" :disabled="Boolean(busy)" @click="emit('action', 'start')">
          <Play :size="15" aria-hidden="true" />{{ $t('启动') }}
        </button>
        <button v-if="canResume" type="button" class="primary-action" :disabled="Boolean(busy)" @click="emit('action', 'resume')">
          <RotateCcw :size="15" aria-hidden="true" />{{ $t('继续') }}
        </button>
        <button v-if="canPause" type="button" class="plain-action" :disabled="Boolean(busy)" @click="emit('action', 'pause')">
          <Pause :size="15" aria-hidden="true" />{{ $t('暂停') }}
        </button>
        <button type="button" class="plain-action" @click="emit('openBrowser')">
          <ExternalLink :size="15" aria-hidden="true" />{{ $t('打开浏览器') }}
        </button>
      </div>
    </header>

    <nav class="section-tabs" :aria-label="$t('任务详情分区')">
      <button v-for="item in sections" :key="item.id"
        type="button" :class="{ active: section === item.id }" @click="section = item.id">
        {{ $t(item.label) }}
      </button>
    </nav>

    <p v-if="error" class="task-error">{{ error }}</p>

    <section v-if="section === 'overview'" class="content-section overview-grid">
      <dl>
        <div><dt>{{ $t('状态') }}</dt><dd>{{ $t(taskStatusLabel(detail.task.status)) }}</dd></div>
        <div><dt>{{ $t('运行方式') }}</dt><dd>{{ $t('本机 · App 打开期间') }}</dd></div>
        <div><dt>{{ $t('最近更新') }}</dt><dd>{{ new Date(detail.task.updatedAt).toLocaleString() }}</dd></div>
        <div><dt>{{ $t('动作回执') }}</dt><dd>{{ detail.receipts.length }}</dd></div>
      </dl>
      <button type="button" class="conversation-link" @click="emit('openConversation', detail.task.conversationId)">
        <Terminal :size="15" aria-hidden="true" />{{ $t('返回任务对话') }}
      </button>
      <section v-if="visibleLeads.length" class="lead-section">
        <header><h2>{{ $t('岗位线索') }}</h2><span>{{ detail.leads.filter((lead) => lead.shortlisted).length }} {{ $t('已入选') }}</span></header>
        <button v-for="lead in visibleLeads" :key="lead.id" type="button" class="lead-row" @click="emit('openLead', lead.targetUrl)">
          <span><strong>{{ lead.role }}</strong><small>{{ lead.company }} · {{ lead.location || $t('地点未注明') }}</small></span>
          <span class="lead-score">{{ lead.score ?? '—' }}<small>/100</small></span>
          <span v-if="lead.shortlisted" class="shortlist-label">{{ $t('Shortlist') }}</span>
        </button>
      </section>
      <p class="runtime-note">{{ $t('App 关闭、休眠、浏览器不可用或断网时任务不会继续外部动作。') }}</p>
    </section>

    <section v-else-if="section === 'activity'" class="content-section timeline">
      <p v-if="detail.activity.length === 0" class="empty-copy">{{ $t('暂无任务动态') }}</p>
      <div v-for="item in detail.activity" :key="item.id" class="timeline-row">
        <span class="timeline-dot" aria-hidden="true" />
        <div><strong>{{ item.title }}</strong><p>{{ item.detail }}</p>
          <small>{{ $t(actionStatusLabel(item.status)) }} · {{ new Date(item.occurredAt).toLocaleString() }}</small></div>
      </div>
    </section>

    <section v-else-if="section === 'receipts'" class="content-section receipt-list">
      <p v-if="detail.receipts.length === 0" class="empty-copy">{{ $t('暂无动作回执') }}</p>
      <div v-for="receipt in detail.receipts" :key="receipt.id" class="receipt-row">
        <strong>{{ receipt.toolName }}</strong><span>{{ $t(actionStatusLabel(receipt.status)) }}</span>
        <small>{{ receipt.targetOrigin || $t('本地动作') }} · {{ new Date(receipt.createdAt).toLocaleString() }}</small>
        <small v-if="receipt.evidenceCount">{{ $t('本地证据') }} · {{ receipt.evidenceCount }}</small>
        <p v-if="receipt.errorCode">{{ receipt.errorCode }}</p>
      </div>
    </section>

    <section v-else class="content-section grant-section">
      <template v-if="detail.grant">
        <dl><div><dt>{{ $t('允许站点') }}</dt><dd>{{ detail.grant.allowedDomains.join('、') }}</dd></div>
          <div><dt>{{ $t('允许动作') }}</dt><dd>{{ detail.grant.allowedActions.join('、') }}</dd></div>
          <div><dt>{{ $t('无人值守') }}</dt><dd>{{ detail.grant.unattended ? $t('允许') : $t('不允许') }}</dd></div>
          <div><dt>{{ $t('有效期至') }}</dt><dd>{{ new Date(detail.grant.expiresAt).toLocaleString() }}</dd></div></dl>
        <p v-if="detail.grant.revokedAt" class="task-error"><ShieldOff :size="15" aria-hidden="true" />{{ $t('授权已撤销') }}</p>
      </template>
      <p v-else class="empty-copy">{{ $t('尚未建立授权') }}</p>
    </section>

    <footer class="danger-actions">
      <button v-if="canRevoke" type="button" :disabled="Boolean(busy)" @click="emit('action', 'revoke')">
        <ShieldOff :size="15" aria-hidden="true" />{{ $t('撤销授权') }}
      </button>
      <button v-if="canCancel" type="button" :disabled="Boolean(busy)" @click="emit('action', 'cancel')">
        <Square :size="14" aria-hidden="true" />{{ $t('停止任务') }}
      </button>
      <span v-if="busy"><Ban :size="14" aria-hidden="true" />{{ $t('正在处理…') }}</span>
    </footer>
  </article>
</template>

<style scoped>
.task-inspector { min-width: 0; height: 100%; overflow: auto; padding: 28px clamp(20px, 4vw, 52px); }
.inspector-header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
.heading-copy { min-width: 0; max-width: 760px; } .heading-copy h1 { margin: 8px 0; font-size: 24px; line-height: 1.25; }
.heading-copy p, .runtime-note, .empty-copy { color: var(--muted); } .local-label { color: var(--text-soft); font-size: 12px; }
.header-actions, .danger-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.header-actions button, .danger-actions button, .conversation-link { display: inline-flex; gap: 7px; align-items: center;
  border: 0; border-radius: 8px; padding: 8px 11px; cursor: pointer; color: var(--text); }
.primary-action { background: var(--text); color: var(--bg) !important; } .plain-action, .conversation-link { background: var(--surface); }
.section-tabs { display: flex; gap: 18px; margin-top: 28px; border-bottom: 1px solid var(--border); }
.section-tabs button { border: 0; border-bottom: 2px solid transparent; padding: 9px 0; background: transparent; color: var(--muted); }
.section-tabs button.active { color: var(--text); border-bottom-color: var(--text); }
.content-section { padding: 24px 0; } dl { display: grid; gap: 14px; margin: 0; }
dl div { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 16px; } dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
.overview-grid { display: grid; gap: 22px; } .conversation-link { width: fit-content; }
.lead-section { display: grid; gap: 5px; } .lead-section header { display: flex; justify-content: space-between; align-items: baseline; }
.lead-section h2 { margin: 0; font-size: 14px; } .lead-section header span { color: var(--muted); font-size: 12px; }
.lead-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 10px 0;
  border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); text-align: left; cursor: pointer; }
.lead-row > span:first-child { display: grid; gap: 3px; min-width: 0; } .lead-row small { color: var(--muted); }
.lead-score { font: 600 13px var(--font-mono); } .lead-score small { font-size: 9px; }
.shortlist-label { padding: 3px 6px; border-radius: 6px; background: var(--surface-strong); font-size: 10px; }
.timeline { display: grid; gap: 4px; } .timeline-row { display: grid; grid-template-columns: 12px 1fr; gap: 10px; padding: 10px 0; }
.timeline-dot { width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: var(--muted); }
.timeline-row p, .timeline-row small { margin: 3px 0 0; color: var(--muted); }
.receipt-list { display: grid; gap: 6px; } .receipt-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 14px; padding: 12px 0; border-bottom: 1px solid var(--border); }
.receipt-row small, .receipt-row p { grid-column: 1 / -1; margin: 0; color: var(--muted); }
.task-error { display: flex; gap: 7px; align-items: center; color: var(--danger); }
.mobile-back { display: none; width: fit-content; align-items: center; gap: 5px; border: 0; background: transparent; color: var(--text-soft); }
.danger-actions { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--border); color: var(--muted); }
.danger-actions button { color: var(--danger); background: transparent; border: 1px solid var(--border); }
@media (max-width: 700px) { .inspector-header { display: grid; } .mobile-back { display: inline-flex; } .task-inspector { padding: 20px 16px; }
  dl div { grid-template-columns: 1fr; gap: 4px; } .section-tabs { overflow-x: auto; } }
</style>

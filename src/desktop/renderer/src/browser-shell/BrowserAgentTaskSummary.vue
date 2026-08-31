<script setup lang="ts">
import { CircleAlert, Eye, FilePenLine, MousePointer2 } from "@lucide/vue";
import { computed } from "vue";

import type { BrowserAgentChromeView } from "@desktop/types";
import { translate, translateFormat } from "../i18n/locale";

const props = defineProps<{ state: BrowserAgentChromeView }>();
const impactLabel = computed(() => {
  switch (props.state.currentAction?.impact) {
    case "page_change": return "会更改当前页面";
    case "external_commitment": return "可能产生外部承诺";
    default: return "只读取页面";
  }
});
const accessLabel = computed(() => {
  switch (props.state.pageAccess?.mode) {
    case "write_granted": return "已允许页面写入";
    case "reviewing": return "正在等待填写审核";
    default: return "只读访问";
  }
});
const summaryCopy = computed(() => props.state.phase === "reviewing" && props.state.review
  ? translateFormat("本批共有 {count} 项页面修改", {
      count: props.state.review.total,
    })
  : translate(props.state.summary));
</script>

<template>
  <section class="task-summary" aria-labelledby="agent-summary-heading">
    <h3 id="agent-summary-heading">{{ $t('当前状态') }}</h3>
    <p class="summary-copy">{{ summaryCopy }}</p>

    <div v-if="state.requiredUserAction" class="required-action" role="status">
      <CircleAlert :size="15" :stroke-width="2" aria-hidden="true" />
      <span><strong>{{ $t('需要你处理') }}</strong>{{ $t(state.requiredUserAction.label) }}</span>
    </div>

    <dl>
      <div>
        <dt>{{ $t('当前目标') }}</dt>
        <dd>{{ state.goal }}</dd>
      </div>
      <div v-if="state.currentAction">
        <dt>{{ $t('正在执行') }}</dt>
        <dd class="action-value">
          <span><MousePointer2 :size="14" aria-hidden="true" />{{ $t(state.currentAction.label) }}</span>
          <small :class="{ attention: state.currentAction.impact === 'external_commitment' }">
            {{ $t(impactLabel) }}
          </small>
        </dd>
      </div>
      <div>
        <dt>{{ $t('页面访问') }}</dt>
        <dd class="inline-value">
          <FilePenLine v-if="state.pageAccess?.mode === 'write_granted'" :size="14" aria-hidden="true" />
          <Eye v-else :size="14" aria-hidden="true" />
          {{ $t(accessLabel) }}
        </dd>
      </div>
      <div v-if="state.targetOrigin">
        <dt>{{ $t('目标站点') }}</dt>
        <dd class="origin">{{ state.targetOrigin }}</dd>
      </div>
      <div v-if="state.review">
        <dt>{{ $t('填写审核') }}</dt>
        <dd>{{ $tf('本批共有 {count} 项页面修改', {
          count: state.review.total,
        }) }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.task-summary { min-width: 0; }
h3 { margin: 0; font-size: 13px; font-weight: 600; }
.summary-copy { margin: 7px 0 0; color: var(--text-soft); font-size: 13px; line-height: 1.45; }
.required-action { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 7px;
  margin-top: 12px; padding: 9px; border-radius: 8px; background: var(--surface);
  color: var(--browser-attention); font-size: 12px; }
.required-action span { display: grid; gap: 2px; color: var(--text-soft); }
.required-action strong { color: var(--browser-attention); }
dl { display: grid; gap: 11px; margin: 14px 0 0; }
dl div { display: grid; grid-template-columns: 78px minmax(0, 1fr); gap: 10px; }
dt { color: var(--muted); font-size: 12px; }
dd { margin: 0; overflow-wrap: anywhere; color: var(--text-soft); font-size: 12px;
  line-height: 1.4; }
.action-value { display: grid; gap: 3px; }
.action-value span, .inline-value { display: inline-flex; align-items: center; gap: 5px; }
.action-value small { color: var(--muted); font-size: 12px; }
.action-value small.attention { color: var(--browser-attention); }
.origin { font-family: var(--font-mono); }
</style>

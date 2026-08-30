<script setup lang="ts">
import { ShieldCheck, ShieldOff } from "@lucide/vue";
import { computed } from "vue";

import type { BrowserAgentChromeView } from "@desktop/types";

type Delegation = NonNullable<BrowserAgentChromeView["delegation"]>;
const props = defineProps<{
  delegation: Delegation | null;
  targetOrigin: string | null;
}>();

const capabilityLabels: Record<Delegation["capabilities"][number], string> = {
  read: "读取页面",
  control: "操作页面",
  write: "写入页面",
  download: "下载文件",
  submit: "提交外部内容",
};
const stateLabel = computed(() => {
  if (!props.delegation) return "尚未建立授权";
  if (props.delegation.state === "revoked") return "授权已撤销";
  if (props.delegation.state === "expired") return "授权已过期";
  return "授权有效";
});
</script>

<template>
  <section class="inspector-section grant-summary" aria-labelledby="agent-grant-heading">
    <header>
      <h3 id="agent-grant-heading">{{ $t('授权范围') }}</h3>
      <span :class="['grant-state', delegation?.state ?? 'missing']">
        <ShieldCheck v-if="delegation?.state === 'active'" :size="14" aria-hidden="true" />
        <ShieldOff v-else :size="14" aria-hidden="true" />
        {{ $t(stateLabel) }}
      </span>
    </header>
    <p v-if="!delegation" class="empty-copy">{{ $t('完整授权信息请在任务详情中查看。') }}</p>
    <dl v-else>
      <div>
        <dt>{{ $t('目标站点') }}</dt>
        <dd>{{ targetOrigin || $t('尚未确定') }}</dd>
      </div>
      <div>
        <dt>{{ $t('允许站点') }}</dt>
        <dd class="wrap-list">
          <span v-if="delegation.domains.length === 0">{{ $t('尚未确定') }}</span>
          <span v-for="domain in delegation.domains" :key="domain">{{ domain }}</span>
          <span v-if="delegation.moreDomainCount">+{{ delegation.moreDomainCount }}</span>
        </dd>
      </div>
      <div>
        <dt>{{ $t('允许动作') }}</dt>
        <dd class="wrap-list">
          <span v-if="delegation.capabilities.length === 0">{{ $t('尚未确定') }}</span>
          <span v-for="capability in delegation.capabilities" :key="capability">
            {{ $t(capabilityLabels[capability] ?? '浏览器动作') }}
          </span>
        </dd>
      </div>
      <div>
        <dt>{{ $t('无人值守') }}</dt>
        <dd>{{ delegation.unattended ? $t('允许') : $t('不允许') }}</dd>
      </div>
      <div>
        <dt>{{ $t('有效期至') }}</dt>
        <dd>{{ delegation.expiresAt
          ? new Date(delegation.expiresAt).toLocaleString($locale())
          : $t('尚未确定') }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.inspector-section { padding: 16px 0; border-bottom: 1px solid var(--border); }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
h3 { margin: 0; font-size: 13px; font-weight: 600; }
.grant-state { display: inline-flex; align-items: center; gap: 5px; color: var(--muted);
  font-size: 12px; }
.grant-state.active { color: var(--browser-success); }
.grant-state.revoked, .grant-state.expired { color: var(--danger); }
.empty-copy { margin: 10px 0 0; color: var(--muted); font-size: 12px; }
dl { display: grid; gap: 10px; margin: 12px 0 0; }
dl div { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 10px; }
dt { color: var(--muted); font-size: 12px; }
dd { margin: 0; overflow-wrap: anywhere; color: var(--text-soft); font-size: 12px; }
.wrap-list { display: flex; flex-wrap: wrap; gap: 5px 8px; }
.wrap-list span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
</style>

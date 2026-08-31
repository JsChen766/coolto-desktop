<script setup lang="ts">
import { Ban, Check, CircleAlert, Clock3 } from "@lucide/vue";
import { computed, type Component } from "vue";

import type { BrowserAgentChromeView } from "@desktop/types";

type Activity = BrowserAgentChromeView["recentActivity"][number];
const props = defineProps<{ items: Activity[] }>();
const visibleItems = computed(() => props.items.slice(0, 3));

const icons: Record<Activity["tone"], Component> = {
  neutral: Clock3,
  success: Check,
  warning: CircleAlert,
  danger: Ban,
};
const toneLabels: Record<Activity["tone"], string> = {
  neutral: "状态更新",
  success: "已完成",
  warning: "需要注意",
  danger: "未完成",
};
</script>

<template>
  <section class="inspector-section" aria-labelledby="agent-activity-heading">
    <h3 id="agent-activity-heading">{{ $t('最近活动') }}</h3>
    <p v-if="visibleItems.length === 0" class="empty-copy">{{ $t('暂无最近活动') }}</p>
    <ol v-else class="activity-list">
      <li v-for="(item, index) in visibleItems"
        :key="`${item.kind}:${item.occurredAt}:${item.label}:${index}`"
        :class="`tone-${item.tone}`">
        <span class="activity-icon" role="img"
          :aria-label="$t(toneLabels[item.tone] ?? '状态更新')">
          <component :is="icons[item.tone] ?? Clock3" :size="13" :stroke-width="2"
            aria-hidden="true" />
        </span>
        <div>
          <strong>{{ $t(item.label) }}</strong>
          <span v-if="item.origin">{{ item.origin }}</span>
          <time :datetime="item.occurredAt">
            {{ new Date(item.occurredAt).toLocaleTimeString($locale(), {
              hour: '2-digit', minute: '2-digit',
            }) }}
          </time>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.inspector-section { min-width: 0; }
h3 { margin: 0; font-size: 13px; font-weight: 600; }
.empty-copy { margin: 10px 0 0; color: var(--muted); font-size: 12px; }
.activity-list { display: grid; gap: 0; margin: 10px 0 0; padding: 0; list-style: none; }
.activity-list li { display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px;
  padding: 8px 0; }
.activity-icon { display: grid; place-items: center; width: 20px; height: 20px;
  border-radius: 6px; background: var(--surface); color: var(--muted); }
.tone-success .activity-icon { color: var(--browser-success); }
.tone-warning .activity-icon { color: var(--browser-attention); }
.tone-danger .activity-icon { color: var(--danger); }
.activity-list div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px;
  min-width: 0; }
.activity-list strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 12px; font-weight: 600; }
.activity-list span, .activity-list time { color: var(--muted); font-size: 12px; }
.activity-list div > span { grid-column: 1 / -1; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; }
</style>

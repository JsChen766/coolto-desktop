<script setup lang="ts">
import type { PreferenceResolutionV1 } from "@desktop/types";
import { useId } from "vue";

defineProps<{ resolution?: PreferenceResolutionV1 | undefined }>();
const titleId = useId();
const descriptionId = useId();

function valueText(value: string | string[]): string {
  return Array.isArray(value) ? value.join("、") : value;
}
function reasonText(reason: string): string {
  return {
    current_turn_override: "本轮指令优先",
    scope_more_specific: "更具体的范围优先",
    higher_priority: "优先级更高",
    explicit_user_precedence: "你确认的规则优先",
    newer_confirmation: "较新的确认优先",
    equivalent_rule_lower_rank: "等价规则已被更具体规则覆盖",
    conflict_equal_rank: "同范围规则冲突，未自动选择",
    disabled: "已停用",
    deleted: "已删除",
    expired: "已过期",
    scope_not_applicable: "不适用于当前范围",
  }[reason] ?? "当前范围未采用";
}
</script>

<template>
  <section v-if="resolution" class="preference-effect" role="region" aria-live="polite" :aria-labelledby="titleId" :aria-describedby="descriptionId">
    <div class="preference-section-heading"><div><h3 :id="titleId">{{ $t('本轮生效说明') }}</h3><p :id="descriptionId">{{ $t('只解释当前读取结果，不会修改偏好。') }}</p></div></div>
    <p v-if="!resolution.applied.length && !resolution.conflicts.length" class="preference-muted">{{ $t('本轮没有可应用的长期偏好。') }}</p>
    <div v-for="item in resolution.applied" :key="item.preferenceId" class="preference-effect-row">
      <strong>{{ item.key }}</strong><span>{{ valueText(item.value) }}</span><small>{{ $t(item.preferenceId.startsWith('current-turn:') ? '本轮指令优先' : reasonText(item.reason)) }}</small>
    </div>
    <div v-for="item in resolution.overridden" :key="item.preferenceId" class="preference-effect-row muted"><strong>{{ item.key }}</strong><small>{{ $t(reasonText(item.reason)) }}</small></div>
    <div v-for="item in resolution.conflicts" :key="item.conflictGroup" class="preference-effect-row conflict"><strong>{{ item.key }}</strong><small>{{ $t(reasonText(item.reason)) }}</small></div>
    <div v-for="item in resolution.ignored" :key="item.preferenceId" class="preference-effect-row muted"><strong>{{ $t('规则未采用') }}</strong><small>{{ $t(reasonText(item.reason)) }}</small></div>
  </section>
</template>

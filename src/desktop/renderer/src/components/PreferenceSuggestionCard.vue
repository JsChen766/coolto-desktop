<script setup lang="ts">
import { Lightbulb, X } from "@lucide/vue";
import { useId } from "vue";
import type { PreferenceSuggestionV1 } from "@desktop/types";
import { translate } from "../i18n/locale";

const props = defineProps<{ suggestion: PreferenceSuggestionV1; busy?: boolean }>();
const emit = defineEmits<{ save: [suggestion: PreferenceSuggestionV1]; reject: [id: string] }>();
const titleId = useId();
const descriptionId = useId();

function valueText(value: string | string[]): string { return Array.isArray(value) ? value.join("、") : value; }
function scopeText(): string {
  const scope = props.suggestion.scope;
  if (scope.kind === "global") return translate("全局");
  if (scope.domain) return `${translate("浏览器")}：${scope.domain}`;
  const label = translate(scope.kind);
  return scope.targetFingerprint ? `${label} · ${translate("当前目标")}` : label;
}
</script>

<template>
  <article class="preference-suggestion" role="region" :aria-labelledby="titleId" :aria-describedby="descriptionId" aria-live="polite" :aria-busy="busy">
    <header class="preference-suggestion-heading icon-label"><Lightbulb :size="16" :stroke-width="1.8" aria-hidden="true" /><strong :id="titleId">{{ $t('可能的偏好') }}</strong></header>
    <p :id="descriptionId">{{ $t('根据已汇总的行为信号发现，不包含原始聊天或简历内容。') }}</p>
    <dl><div><dt>{{ $t('规则') }}</dt><dd>{{ suggestion.key }}：{{ valueText(suggestion.proposedValue) }}</dd></div><div><dt>{{ $t('范围') }}</dt><dd>{{ scopeText() }}</dd></div><div><dt>{{ $t('观察') }}</dt><dd>{{ suggestion.observationCount }} 次 · {{ suggestion.observationWindow.from }} 至 {{ suggestion.observationWindow.to }}</dd></div><div><dt>{{ $t('原因') }}</dt><dd>{{ suggestion.rationale.code }}</dd></div></dl>
    <div class="preference-suggestion-actions"><button class="primary-button" type="button" :disabled="busy" @click="emit('save', suggestion)">{{ $t('保存为偏好') }}</button><button class="secondary-button" type="button" :disabled="busy" @click="emit('reject', suggestion.id)"><X :size="14" :stroke-width="1.8" aria-hidden="true" />{{ $t('不保存且不再提示') }}</button></div>
  </article>
</template>

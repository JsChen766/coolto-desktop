<script setup lang="ts">
import { X } from "@lucide/vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import type { DesktopApi, PreferenceDesktopView, PreferenceSuggestionV1 } from "@desktop/types";
import type { DialogSelectOption } from "./dialog-select-types";
import DialogSelect from "./DialogSelect.vue";
import PreferenceEffectInspector from "./PreferenceEffectInspector.vue";
import PreferenceSuggestionCard from "./PreferenceSuggestionCard.vue";
import {
  keyText,
  PREFERENCE_FORM_KEYS,
  preferenceFormErrors,
  preferenceScopesForKey,
  valueText,
  type PreferenceFormErrors,
} from "../preference/preference-form";
import { usePreferenceDialog } from "../preference/use-preference-dialog";
import { translate, translateFormat } from "../i18n/locale";

const props = defineProps<{ api: DesktopApi }>();
const emit = defineEmits<{ close: [] }>();
const state = usePreferenceDialog(props.api);
const dialog = ref<HTMLElement>();
const errors = ref<PreferenceFormErrors>({});
type PreferenceDialogPhase = "list" | "form" | "proposal";
const phase = computed<PreferenceDialogPhase>(() => state.proposal.value
  ? "proposal" : state.draft.value ? "form" : "list");

onMounted(() => { void state.load().then(() => nextTick(focusPhase)); });
watch([phase, state.items, state.busy], () => { void nextTick(focusPhase); });

const preferenceKeyOptions = computed<DialogSelectOption[]>(() =>
  PREFERENCE_FORM_KEYS.map((key) => ({ value: key, label: translate(keyText(key)) })));

const preferenceScopeOptions = computed<DialogSelectOption[]>(() => {
  if (!state.draft.value) return [];
  return preferenceScopesForKey(state.draft.value.key).map((scope) => ({
    value: scope,
    label: scopeOptionText(scope),
  }));
});

function setDraftField(
  field: keyof NonNullable<typeof state.draft.value>,
  value: string,
): void {
  if (!state.draft.value) return;
  const next = { ...state.draft.value, [field]: value } as NonNullable<typeof state.draft.value>;
  if (field === "key") {
    const scopes = preferenceScopesForKey(next.key);
    if (!scopes.includes(next.scopeKind)) next.scopeKind = scopes[0] ?? "global";
    next.domain = "";
    next.targetFingerprint = "";
  } else if (field === "scopeKind") {
    next.domain = "";
    next.targetFingerprint = "";
  }
  state.draft.value = next;
  delete errors.value[field];
}

function patch(field: keyof NonNullable<typeof state.draft.value>, event: Event): void {
  setDraftField(field, (event.target as HTMLInputElement).value);
}
function review(): void {
  if (!state.draft.value) return;
  errors.value = preferenceFormErrors(state.draft.value);
  if (Object.keys(errors.value).length) { void nextTick(focusFirstInvalid); return; }
  void state.prepare();
}
function dismiss(): void { emit("close"); }
function focusPhase(): void {
  const selector = phase.value === "proposal"
    ? "[data-preference-proposal-focus]"
    : phase.value === "form" ? "[data-preference-form-focus]" : "[data-preference-list-focus]";
  dialog.value?.querySelector<HTMLElement>(selector)?.focus();
}
function focusFirstInvalid(): void { dialog.value?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus(); }
function errorId(field: string): string { return `preference-field-error-${field}`; }
function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dismiss(); return; }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
  const first = focusable[0]; const last = focusable.at(-1);
  if (!first || !last) return;
  const active = document.activeElement;
  if (!active || !dialog.value.contains(active)) {
    event.preventDefault();
    event.stopPropagation();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); event.stopPropagation(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); event.stopPropagation(); first.focus();
  }
}
function syncStatusText(item: PreferenceDesktopView): string {
  return { clean: "本机已确认", pending: "已写入本机", conflict: "同步冲突", failed: "同步失败" }[item.syncStatus];
}
function lifecycleText(item: PreferenceDesktopView): string {
  if (item.deletedAt) return "已删除";
  if (item.expiresAt && Date.parse(item.expiresAt) <= Date.now()) return "已过期";
  return item.status === "disabled" ? "已停用" : "已启用";
}
function scopeLabel(item: Pick<PreferenceDesktopView, "scope">): string {
  if (item.scope.kind === "global") return translate("全局");
  if (item.scope.kind === "browser_fill") {
    return `${translate("浏览器")}：${item.scope.domain ?? translate("精确域名")}`;
  }
  const label = translate(item.scope.kind);
  return item.scope.targetFingerprint ? `${label} · ${translate("当前目标")}` : label;
}
function scopeOptionText(scope: string): string {
  return scope === "global" ? translate("全局") : translate(scope);
}
function usageText(item: PreferenceDesktopView): string {
  return item.localUsage
    ? translateFormat("本机最近使用 {count} 次", { count: item.localUsage.useCount })
    : translate("本机尚未使用");
}
function canAcceptServer(item: PreferenceDesktopView): boolean {
  const issue = item.syncIssue;
  return !!issue && issue.serverVersion > 0 && issue.serverOperation !== null;
}
function canReapply(item: PreferenceDesktopView): boolean {
  const issue = item.syncIssue;
  return !!issue && issue.serverOperation === "upsert" && issue.serverPreference !== null;
}
function saveSuggestion(suggestion: PreferenceSuggestionV1): void { void state.saveSuggestion(suggestion); }
</script>

<template>
  <div class="dialog-backdrop preference-dialog-backdrop" @mousedown.self="dismiss">
    <section ref="dialog" class="dialog-card preference-dialog" role="dialog" aria-modal="true" aria-labelledby="preference-dialog-title" aria-describedby="preference-dialog-description" tabindex="-1" @keydown="keydown">
      <header class="preference-dialog-header"><div><h2 id="preference-dialog-title">{{ $t('偏好') }}</h2><p id="preference-dialog-description">{{ $t('保存表达和决策习惯，Profile 默认值与 Answer Vault 保持独立。') }}</p></div><button class="icon-button" type="button" :aria-label="$t('关闭偏好')" :title="$t('关闭偏好')" @click="dismiss"><X :size="17" :stroke-width="1.8" aria-hidden="true" /></button></header>
      <p v-if="state.error.value" class="preference-error" role="alert" aria-live="assertive">{{ $t(state.error.value) }}</p><p v-if="state.notice.value" class="preference-notice" role="status" aria-live="polite">{{ $t(state.notice.value) }}</p>
      <p v-if="state.busy.value && !state.items.value.length" class="preference-loading" role="status">{{ $t('正在加载已确认偏好…') }}</p>
      <template v-else>
        <section v-if="state.proposal.value" class="preference-proposal" aria-live="polite"><h3>{{ $t('确认偏好变更') }}</h3><p>{{ state.proposal.value.explanation }}。{{ $t('确认后会写入本机偏好（经本地同步队列持久化；开源版不连接 Coolto 云）。') }}</p><dl><div><dt>{{ $t('规则') }}</dt><dd>{{ state.proposal.value.next?.key ?? state.proposal.value.current?.key }}</dd></div><div><dt>{{ $t('当前值') }}</dt><dd>{{ state.proposal.value.current ? valueText(state.proposal.value.current.value) : $t('未设置') }}</dd></div><div><dt>{{ $t('新值') }}</dt><dd>{{ state.proposal.value.next ? valueText(state.proposal.value.next.value) : $t('删除后不再生效') }}</dd></div><div><dt>{{ $t('范围 / 优先级') }}</dt><dd>{{ state.proposal.value.next ? scopeLabel({ scope: state.proposal.value.next.scope }) : $t('当前规则') }} · {{ state.proposal.value.next?.priority ?? '—' }}</dd></div></dl><p class="preference-impact">{{ $t('只影响未来任务；历史简历、投递记录和对话不变。') }}</p><div class="dialog-actions"><button class="secondary-button" type="button" data-preference-proposal-focus :disabled="state.busy.value" @click="state.cancelEdit">{{ $t('返回修改') }}</button><button class="primary-button" type="button" :disabled="state.busy.value" @click="state.confirm">{{ state.busy.value ? $t('正在保存…') : $t('确认并保存') }}</button></div></section>
        <form v-else-if="state.draft.value" class="preference-form" @submit.prevent="review">
          <div class="preference-form-grid">
            <label>
              <span>{{ $t('规则类型') }}</span>
              <DialogSelect
                data-preference-form-focus
                :model-value="state.draft.value.key"
                :options="preferenceKeyOptions"
                :invalid="Boolean(errors.key)"
                :described-by="errors.key ? errorId('key') : ''"
                @update:model-value="setDraftField('key', $event)"
              />
              <small v-if="errors.key" :id="errorId('key')" role="alert" aria-live="assertive">{{ $t(errors.key) }}</small>
            </label>
            <label>
              <span>{{ $t('优先级') }}</span>
              <input type="number" min="0" max="100" step="1" :value="state.draft.value.priority" :aria-invalid="Boolean(errors.priority)" :aria-describedby="errors.priority ? errorId('priority') : undefined" @input="patch('priority', $event)">
              <small v-if="errors.priority" :id="errorId('priority')" role="alert" aria-live="assertive">{{ $t(errors.priority) }}</small>
            </label>
          </div>
          <label>
            <span>{{ $t('偏好值') }}</span>
            <input :value="state.draft.value.value" :placeholder="$t('多个值用逗号分隔')" :aria-invalid="Boolean(errors.value)" :aria-describedby="errors.value ? errorId('value') : undefined" @input="patch('value', $event)">
            <small v-if="errors.value" :id="errorId('value')" role="alert" aria-live="assertive">{{ $t(errors.value) }}</small>
          </label>
          <label>
            <span>{{ $t('作用域') }}</span>
            <DialogSelect
              :model-value="state.draft.value.scopeKind"
              :options="preferenceScopeOptions"
              :invalid="Boolean(errors.scopeKind)"
              :described-by="errors.scopeKind ? errorId('scopeKind') : ''"
              @update:model-value="setDraftField('scopeKind', $event)"
            />
            <small v-if="errors.scopeKind" :id="errorId('scopeKind')" role="alert" aria-live="assertive">{{ $t(errors.scopeKind) }}</small>
          </label>
          <label v-if="state.draft.value.scopeKind === 'browser_fill'">
            <span>{{ $t('精确域名') }}</span>
            <input :value="state.draft.value.domain" placeholder="example.com" :aria-invalid="Boolean(errors.domain)" :aria-describedby="errors.domain ? errorId('domain') : undefined" @input="patch('domain', $event)">
            <small v-if="errors.domain" :id="errorId('domain')" role="alert" aria-live="assertive">{{ $t(errors.domain) }}</small>
          </label>
          <label v-if="['resume', 'job_search', 'interview'].includes(state.draft.value.scopeKind)">
            <span>{{ $t('目标指纹') }}</span>
            <input :value="state.draft.value.targetFingerprint" :placeholder="$t('64 位十六进制')" :aria-invalid="Boolean(errors.targetFingerprint)" :aria-describedby="errors.targetFingerprint ? errorId('targetFingerprint') : undefined" @input="patch('targetFingerprint', $event)">
            <small v-if="errors.targetFingerprint" :id="errorId('targetFingerprint')" role="alert" aria-live="assertive">{{ $t(errors.targetFingerprint) }}</small>
          </label>
          <p class="preference-form-hint">{{ $t('目标范围由 Agent 根据当前 Profile 目标生成；这里先管理全局和任务类型习惯。') }}</p>
          <div class="dialog-actions"><button class="secondary-button" type="button" :disabled="state.busy.value" @click="state.cancelEdit">{{ $t('取消') }}</button><button class="primary-button" type="submit" :disabled="state.busy.value">{{ $t('查看变更并确认') }}</button></div>
        </form>
        <template v-else><section class="preference-list-section"><div class="preference-section-heading"><div><h3>{{ $t('已确认的长期偏好') }}</h3><p>{{ $t('仅影响未来任务；历史资产保持原样。') }}</p></div><button class="primary-button" type="button" data-preference-list-focus @click="state.beginCreate">{{ $t('新增偏好') }}</button></div><p v-if="!state.items.value.length" class="preference-empty">{{ $t('还没有已确认的长期偏好') }}</p><article v-for="item in state.items.value" :key="item.id" class="preference-row"><div class="preference-row-main"><strong>{{ $t(keyText(item.key)) }}</strong><span>{{ valueText(item.value) }}</span><small>{{ scopeLabel(item) }} · {{ $t('优先级') }} {{ item.priority }} · {{ item.source === 'explicit_user' ? $t('你确认的偏好') : $t('由行为建议后确认') }}</small><small class="preference-status">{{ $t(lifecycleText(item)) }} · {{ $t(syncStatusText(item)) }} · {{ usageText(item) }}</small><p v-if="item.syncIssue" class="preference-conflict">{{ $t('本机偏好存在同步冲突；可接受已拉取副本，或重新应用本机规则。') }}</p></div><div class="preference-row-actions"><template v-if="!item.deletedAt && !item.syncIssue"><button class="small-secondary-button" type="button" @click="state.beginEdit(item)">{{ $t('编辑') }}</button><button v-if="item.status === 'active'" class="small-secondary-button" type="button" @click="state.prepareAction(item.id, 'disable')">{{ $t('停用') }}</button><button v-else class="small-secondary-button" type="button" @click="state.prepareAction(item.id, 'enable')">{{ $t('重新启用') }}</button><button class="small-secondary-button danger-text" type="button" @click="state.prepareAction(item.id, 'delete')">{{ $t('删除') }}</button></template><button v-if="canAcceptServer(item)" class="small-secondary-button" type="button" @click="state.prepareAction(item.id, 'accept-server')">{{ $t('接受已拉取副本') }}</button><button v-if="canReapply(item)" class="small-secondary-button" type="button" @click="state.prepareAction(item.id, 'reapply')">{{ $t('重新应用本地') }}</button></div></article></section><section class="preference-suggestions"><div class="preference-section-heading"><div><h3>{{ $t('行为建议') }}</h3><p>{{ $t('只接收 ANA 汇总信号；未确认前不会应用。') }}</p></div><button v-if="state.suggestions.value.length" class="small-secondary-button" type="button" @click="state.clearSuppressed">{{ $t('清除已忽略建议') }}</button></div><p v-if="!state.suggestions.value.length" class="preference-muted">{{ $t('当前没有新的可能偏好。') }}</p><PreferenceSuggestionCard v-for="suggestion in state.suggestions.value" :key="suggestion.id" :suggestion="suggestion" :busy="state.busy.value" @save="saveSuggestion" @reject="state.rejectSuggestion" /></section><PreferenceEffectInspector :resolution="state.resolution.value" /><section class="preference-answer-vault"><h3>{{ $t('Answer Vault（独立）') }}</h3><p>{{ $t('Answer Vault 保存可复用的用户事实或回答；Preference 只保存表达与决策习惯，不混用。') }}</p></section><div class="dialog-actions"><button class="secondary-button" type="button" @click="state.explain">{{ $t('查看本轮生效说明') }}</button><button class="primary-button" type="button" @click="dismiss">{{ $t('关闭') }}</button></div></template>
      </template>
    </section>
  </div>
</template>

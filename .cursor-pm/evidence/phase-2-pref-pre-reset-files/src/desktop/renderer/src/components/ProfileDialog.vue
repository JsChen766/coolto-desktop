<script setup lang="ts">
import { X } from "@lucide/vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";

import type { DesktopApi } from "@desktop/types";
import {
  PROFILE_FORM_FIELDS,
  profileFormErrors,
  type ProfileFormDraft,
  type ProfileFormErrors,
} from "../profile/profile-form";
import {
  PROFILE_CAREER_STAGES,
  PROFILE_LANGUAGES,
  PROFILE_RESUME_STYLES,
  isProfileCareerStage,
  isProfileLanguage,
  isProfileResumeStyle,
  profileCareerStageLabel,
  profileDefaultLabel,
} from "../../../../profile/profile-defaults";
import { useProfileDialog } from "../profile/use-profile-dialog";
import ProfileTargetEditor from "./ProfileTargetEditor.vue";

const props = defineProps<{ api: DesktopApi }>();
const emit = defineEmits<{ close: [] }>();
const state = useProfileDialog(props.api);
const errors = ref<ProfileFormErrors>({});
const dialog = ref<HTMLElement>();
const changedFields = computed(() => PROFILE_FORM_FIELDS.filter((field) =>
  state.proposal.value?.next?.[field.key] !== state.proposal.value?.current[field.key]));
const careerChanged = computed(() => {
  const current = state.proposal.value?.current;
  const next = state.proposal.value?.next;
  return Boolean(current && next && (
    current.currentTitle !== next.currentTitle ||
    current.currentCompany !== next.currentCompany ||
    current.yearsOfExperience !== next.yearsOfExperience ||
    current.careerStage !== next.careerStage ||
    current.preferredLanguage !== next.preferredLanguage ||
    current.resumeStyle !== next.resumeStyle ||
    JSON.stringify(current.careerTargets ?? []) !== JSON.stringify(next.careerTargets ?? [])
  ));
});
const careerDiffs = computed(() => {
  const current = state.proposal.value?.current;
  const next = state.proposal.value?.next;
  if (!current || !next) return [];
  const values = [
    ["当前职位", current.currentTitle, next.currentTitle],
    ["当前公司", current.currentCompany, next.currentCompany],
    ["工作年限", current.yearsOfExperience == null ? null : `${current.yearsOfExperience} 年`, next.yearsOfExperience == null ? null : `${next.yearsOfExperience} 年`],
    ["职业阶段", current.careerStage, next.careerStage],
    ["默认语言", current.preferredLanguage, next.preferredLanguage],
    ["默认风格", current.resumeStyle, next.resumeStyle],
    ["求职目标", targetsText(current.careerTargets), targetsText(next.careerTargets)],
  ] as const;
  return values.filter(([, before, after]) => before !== after)
    .map(([key, before, after]) => ({ key, before: text(before), after: text(after) }));
});

onMounted(() => { void state.load().then(focusInitial); });
watch(state.editing, () => { void nextTick(focusInitial); });
watch(state.proposal, () => { void nextTick(focusInitial); });

function patch(key: keyof ProfileFormDraft, event: Event): void {
  if (!state.draft.value) return;
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  state.draft.value = { ...state.draft.value, [key]: target.value };
  delete errors.value[key];
}

async function review(): Promise<void> {
  if (!state.draft.value) return;
  errors.value = profileFormErrors(state.draft.value);
  const first = Object.keys(errors.value)[0];
  if (first) {
    await nextTick();
    dialog.value?.querySelector<HTMLElement>(`[data-profile-field="${first}"]`)
      ?.focus();
    return;
  }
  await state.prepare();
}

function dismiss(): void { emit("close"); }
function focusInitial(): void {
  dialog.value?.querySelector<HTMLElement>("[data-profile-initial-focus]")?.focus();
}
function keydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault(); dismiss(); return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hidden);
  const first = focusable[0]; const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault(); last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}

function text(value: string | null | undefined): string { return value || "未填写"; }
function careerStageText(value: string | null | undefined): string {
  return profileCareerStageLabel(value);
}
function defaultText(kind: "language" | "resumeStyle", value: string | null | undefined): string {
  return profileDefaultLabel(kind, value);
}
function knownCareerStage(value: string): boolean { return isProfileCareerStage(value); }
function knownLanguage(value: string): boolean { return isProfileLanguage(value); }
function knownResumeStyle(value: string): boolean { return isProfileResumeStyle(value); }
function targetsText(targets = state.profile.value?.careerTargets): string {
  return targets?.map((target) =>
    `${target.isPrimary ? "主要：" : ""}${[target.role, ...target.industries, ...target.locations].filter(Boolean).join(" · ")}`,
  ).join("；") || "未设置";
}
</script>

<template>
  <div class="dialog-backdrop profile-dialog-backdrop" @mousedown.self="dismiss">
    <section ref="dialog" class="dialog-card profile-dialog" role="dialog" aria-modal="true"
      aria-labelledby="profile-dialog-title" aria-describedby="profile-dialog-description"
      tabindex="-1" @keydown="keydown">
      <header class="profile-dialog-header">
        <div>
          <h2 id="profile-dialog-title">{{ $t('个人档案') }}</h2>
          <p id="profile-dialog-description">{{ $t('长期职业背景和简历默认值，不会修改登录邮箱或 Experience 事实。') }}</p>
        </div>
        <button class="icon-button" type="button" data-profile-initial-focus :aria-label="$t('关闭个人信息')" :title="$t('关闭')" @click="dismiss">
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <p v-if="state.error.value" class="profile-dialog-error" role="alert">{{ $t(state.error.value) }}</p>
      <p v-if="!state.profile.value && !state.error.value" class="profile-dialog-loading" role="status">{{ $t('正在加载个人信息…') }}</p>

      <template v-else-if="state.profile.value">
        <section v-if="state.profile.value.syncStatus !== 'clean'" class="profile-sync-state"
          :class="state.profile.value.syncStatus" role="status" aria-live="polite">
          <p v-if="state.profile.value.syncStatus === 'pending'">{{ $t('个人信息已保存到本机，正在等待同步。') }}</p>
          <p v-else-if="state.profile.value.syncStatus === 'conflict'">{{ $t('个人信息与服务端版本冲突，请选择处理方式。') }}</p>
          <p v-else>{{ $t('个人信息同步失败，可重新应用本地修改。') }}</p>
          <button v-if="state.profile.value.syncStatus === 'conflict' || state.profile.value.syncStatus === 'failed'"
            class="profile-accept-server" type="button" :disabled="state.busy.value" @click="state.acceptServer">{{ $t('接受服务端版本') }}</button>
        </section>

        <section v-if="state.proposal.value" class="profile-proposal" aria-live="polite">
          <h3>{{ state.proposal.value.kind === 'accept_server' ? $t('确认接受服务端版本') : $t('确认个人档案修改') }}</h3>
          <p>{{ state.proposal.value.kind === 'accept_server' ? $t('确认后将以最新服务端版本替换本机个人档案。') : $t('确认后先保存到本机并写入 Outbox，随后由同步链路提交。') }}</p>
          <dl class="profile-proposal-changes">
            <div v-for="field in changedFields" :key="field.key"><dt>{{ $t(field.label) }}</dt><dd><span>{{ text(state.proposal.value.current[field.key]) }}</span>{{ text(state.proposal.value.next?.[field.key]) }}</dd></div>
          </dl>
          <dl v-if="careerDiffs.length" class="profile-proposal-career-diff" :aria-label="$t('职业背景变更')"><div v-for="field in careerDiffs" :key="field.key"><dt>{{ $t(field.key) }}</dt><dd><span>{{ field.before }}</span><span class="profile-proposal-arrow" aria-hidden="true">→</span><span>{{ field.after }}</span></dd></div></dl>
          <p v-if="careerChanged" class="profile-proposal-item">{{ $t('职业背景、求职目标和简历默认值会一并更新。') }}</p>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" data-profile-initial-focus :disabled="state.busy.value" @click="state.cancelEdit">{{ $t('返回修改') }}</button>
            <button class="primary-button" type="button" :disabled="state.busy.value" @click="state.confirm">{{ state.busy.value ? $t('正在保存…') : $t('确认并保存') }}</button>
          </div>
        </section>

        <form v-else-if="state.editing.value && state.draft.value" class="profile-form" @submit.prevent="review">
          <p class="profile-form-hint">{{ $t('姓名、电话和简历联系邮箱用于生成简历时的必填 header；职业背景和目标可稍后补充。') }}</p>
          <section class="profile-subsection"><h3>{{ $t('联系方式') }}</h3><div class="profile-form-grid">
            <label v-for="field in PROFILE_FORM_FIELDS" :key="field.key" class="profile-form-field">
              <span>{{ $t(field.label) }}<b v-if="field.required" aria-hidden="true"> *</b></span>
              <input :data-profile-field="field.key" :data-profile-initial-focus="field.key === 'fullName' ? '' : undefined" :type="field.type ?? 'text'" :value="state.draft.value[field.key]" :autocomplete="field.autocomplete" :aria-required="field.required" :aria-invalid="Boolean(errors[field.key])" :aria-describedby="errors[field.key] ? `profile-error-${field.key}` : undefined" :disabled="state.busy.value" @input="patch(field.key, $event)">
              <small v-if="errors[field.key]" :id="`profile-error-${field.key}`" class="profile-field-error">{{ $t(errors[field.key]!) }}</small>
            </label>
          </div></section>
          <section class="profile-subsection"><h3>{{ $t('当前职业') }}</h3><div class="profile-form-grid">
            <label class="profile-form-field"><span>{{ $t('当前职位') }}</span><input data-profile-field="currentTitle" :value="state.draft.value.currentTitle" :disabled="state.busy.value" @input="patch('currentTitle', $event)"></label>
            <label class="profile-form-field"><span>{{ $t('当前公司') }}</span><input data-profile-field="currentCompany" :value="state.draft.value.currentCompany" :disabled="state.busy.value" @input="patch('currentCompany', $event)"></label>
            <label class="profile-form-field"><span>{{ $t('工作年限') }}</span><input data-profile-field="yearsOfExperience" type="number" min="0" max="80" step="1" :value="state.draft.value.yearsOfExperience" :disabled="state.busy.value" @input="patch('yearsOfExperience', $event)"><small v-if="errors.yearsOfExperience" class="profile-field-error">{{ $t(errors.yearsOfExperience) }}</small></label>
            <label class="profile-form-field"><span>{{ $t('职业阶段') }}</span><select data-profile-field="careerStage" :value="state.draft.value.careerStage" :disabled="state.busy.value" @change="patch('careerStage', $event)"><option value="">{{ $t('未设置') }}</option><option v-if="state.draft.value.careerStage && !knownCareerStage(state.draft.value.careerStage)" :value="state.draft.value.careerStage">{{ $t('未识别') }}</option><option v-for="stage in PROFILE_CAREER_STAGES" :key="stage" :value="stage">{{ stage }}</option></select></label>
          </div></section>
          <div data-profile-field="careerTargets"><ProfileTargetEditor :targets="state.draft.value.careerTargets" :disabled="state.busy.value" :error="errors.careerTargets" @add="state.addTarget" @update="state.updateTarget" @remove="state.removeTarget" @primary="state.setPrimary" /></div>
          <section class="profile-subsection"><h3>{{ $t('简历默认值') }}</h3><div class="profile-form-grid">
            <label class="profile-form-field"><span>{{ $t('默认语言') }}</span><select :value="state.draft.value.preferredLanguage" :disabled="state.busy.value" @change="patch('preferredLanguage', $event)"><option v-if="state.draft.value.preferredLanguage && !knownLanguage(state.draft.value.preferredLanguage)" :value="state.draft.value.preferredLanguage">{{ $t('未识别') }}</option><option v-for="language in PROFILE_LANGUAGES" :key="language" :value="language">{{ language }}</option></select></label>
            <label class="profile-form-field"><span>{{ $t('默认风格') }}</span><select :value="state.draft.value.resumeStyle" :disabled="state.busy.value" @change="patch('resumeStyle', $event)"><option v-if="state.draft.value.resumeStyle && !knownResumeStyle(state.draft.value.resumeStyle)" :value="state.draft.value.resumeStyle">{{ $t('未识别') }}</option><option v-for="style in PROFILE_RESUME_STYLES" :key="style" :value="style">{{ style }}</option></select></label>
          </div><p class="profile-form-hint">{{ $t('语言和风格只影响后续生成指导，不改写事实或页面质量门槛。当前消息可以临时覆盖，但不会自动保存。') }}</p></section>
          <div class="dialog-actions"><button class="secondary-button" type="button" :disabled="state.busy.value" @click="state.cancelEdit">{{ $t('取消') }}</button><button class="primary-button" type="submit" :disabled="state.busy.value">{{ state.busy.value ? $t('正在保存…') : state.profile.value.syncStatus === 'clean' || state.profile.value.syncStatus === 'pending' ? $t('保存') : $t('重新应用本地修改') }}</button></div>
        </form>

        <section v-else class="profile-view">
          <h3>{{ $t('联系方式') }}</h3><dl><div v-for="field in PROFILE_FORM_FIELDS" :key="field.key"><dt>{{ $t(field.label) }}</dt><dd>{{ text(state.profile.value[field.key]) }}</dd></div></dl>
          <h3>{{ $t('当前职业') }}</h3><dl><div><dt>{{ $t('职位 / 公司') }}</dt><dd>{{ [state.profile.value.currentTitle, state.profile.value.currentCompany].filter(Boolean).join(' · ') || $t('未填写') }}</dd></div><div><dt>{{ $t('工作年限') }}</dt><dd>{{ state.profile.value.yearsOfExperience === null || state.profile.value.yearsOfExperience === undefined ? $t('未填写') : `${state.profile.value.yearsOfExperience} 年` }}</dd></div><div><dt>{{ $t('职业阶段') }}</dt><dd>{{ $t(careerStageText(state.profile.value.careerStage)) }}</dd></div></dl>
          <h3>{{ $t('求职目标') }}</h3><p class="profile-view-targets">{{ targetsText() }}</p>
          <h3>{{ $t('简历默认值') }}</h3><dl><div><dt>{{ $t('语言') }}</dt><dd>{{ $t(defaultText('language', state.profile.value.preferredLanguage)) }}</dd></div><div><dt>{{ $t('风格') }}</dt><dd>{{ $t(defaultText('resumeStyle', state.profile.value.resumeStyle)) }}</dd></div></dl>
          <div class="dialog-actions"><button class="secondary-button" type="button" data-profile-initial-focus @click="dismiss">{{ $t('关闭') }}</button><button class="primary-button" type="button" @click="state.beginEdit">{{ $t('编辑') }}</button></div>
        </section>
      </template>
    </section>
  </div>
</template>

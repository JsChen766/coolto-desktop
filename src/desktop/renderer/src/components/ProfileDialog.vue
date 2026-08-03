<script setup lang="ts">
import { X } from "@lucide/vue";
import { computed, nextTick, onMounted, ref, watch } from "vue";

import type { DesktopApi } from "@desktop/types";
import {
  PROFILE_FORM_FIELDS,
  profileFormErrors,
  type ProfileFormDraft,
} from "../profile/profile-form";
import { useProfileDialog } from "../profile/use-profile-dialog";

const props = defineProps<{ api: DesktopApi }>();
const emit = defineEmits<{ close: [] }>();
const state = useProfileDialog(props.api);
const dialog = ref<HTMLElement>();
const errors = ref<ReturnType<typeof profileFormErrors>>({});
const changedFields = computed(() => PROFILE_FORM_FIELDS.filter((field) =>
  state.proposal.value?.next?.[field.key] !== state.proposal.value?.current[field.key]));

onMounted(() => { void state.load().then(focusInitial); });
watch(state.editing, () => { void nextTick(focusInitial); });
watch(state.proposal, () => { void nextTick(focusInitial); });

function patch(key: keyof ProfileFormDraft, event: Event): void {
  if (!state.draft.value) return;
  state.draft.value = { ...state.draft.value, [key]: (event.target as HTMLInputElement).value };
  delete errors.value[key];
}

async function review(): Promise<void> {
  if (!state.draft.value) return;
  errors.value = profileFormErrors(state.draft.value);
  const first = Object.keys(errors.value)[0];
  if (first) {
    await nextTick();
    dialog.value?.querySelector<HTMLElement>(`[data-profile-field="${first}"]`)?.focus();
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
    event.preventDefault();
    dismiss();
    return;
  }
  if (event.key !== "Tab" || !dialog.value) return;
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>(
    "button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex='-1'])",
  )].filter((element) => !element.hidden);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function value(key: keyof ProfileFormDraft): string {
  return state.profile.value?.[key] || "未填写";
}
</script>

<template>
  <div class="dialog-backdrop profile-dialog-backdrop" @mousedown.self="dismiss">
    <section
      ref="dialog"
      class="dialog-card profile-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-dialog-title"
      aria-describedby="profile-dialog-description"
      tabindex="-1"
      @keydown="keydown"
    >
      <header class="profile-dialog-header">
        <div>
          <h2 id="profile-dialog-title">{{ $t('个人信息') }}</h2>
          <p id="profile-dialog-description">{{ $t('用于简历展示和生成，不会修改登录邮箱。') }}</p>
        </div>
        <button class="icon-button" type="button" :aria-label="$t('关闭个人信息')" @click="dismiss">
          <X :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <p v-if="state.error.value" class="profile-dialog-error" role="alert">{{ $t(state.error.value) }}</p>
      <p v-if="!state.profile.value && !state.error.value" class="profile-dialog-loading" role="status">
        {{ $t('正在加载个人信息…') }}
      </p>

      <template v-else-if="state.profile.value">
        <section
          v-if="state.profile.value.syncStatus !== 'clean'"
          class="profile-sync-state"
          :class="state.profile.value.syncStatus"
          role="status"
          aria-live="polite"
        >
          <p v-if="state.profile.value.syncStatus === 'pending'">{{ $t('个人信息已保存到本机，正在等待同步。') }}</p>
          <p v-else-if="state.profile.value.syncStatus === 'conflict'">{{ $t('个人信息与服务端版本冲突，请选择处理方式。') }}</p>
          <p v-else>{{ $t('个人信息同步失败，可重新应用本地修改。') }}</p>
          <button
            v-if="state.profile.value.syncStatus === 'conflict' || state.profile.value.syncStatus === 'failed'"
            class="profile-accept-server"
            type="button"
            :disabled="state.busy.value"
            @click="state.acceptServer"
          >{{ $t('接受服务端版本') }}</button>
        </section>

        <section v-if="state.proposal.value" class="profile-proposal" aria-live="polite">
          <h3>{{ state.proposal.value.kind === 'accept_server' ? $t('确认接受服务端版本') : $t('确认个人信息修改') }}</h3>
          <p v-if="state.proposal.value.next">{{ $t('确认后先保存到本机并写入 Outbox，随后由同步链路提交。') }}</p>
          <p v-else>{{ $t('确认后将以最新服务端版本替换本机个人信息。') }}</p>
          <dl v-if="state.proposal.value.next" class="profile-proposal-changes">
            <div v-for="field in changedFields" :key="field.key">
              <dt>{{ $t(field.label) }}</dt>
              <dd><span>{{ state.proposal.value.current[field.key] || $t('未填写') }}</span>{{ state.proposal.value.next[field.key] || $t('未填写') }}</dd>
            </div>
          </dl>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" data-profile-initial-focus :disabled="state.busy.value" @click="state.cancelEdit">{{ $t('返回修改') }}</button>
            <button class="primary-button" type="button" :disabled="state.busy.value" @click="state.confirm">
              {{ state.busy.value ? $t('正在保存…') : $t('确认并保存') }}
            </button>
          </div>
        </section>

        <form v-else-if="state.editing.value && state.draft.value" class="profile-form" @submit.prevent="review">
          <p class="profile-form-hint">{{ $t('带 * 的字段为简历生成必填项。') }}</p>
          <div class="profile-form-grid">
            <label v-for="field in PROFILE_FORM_FIELDS" :key="field.key" class="profile-form-field">
              <span>{{ $t(field.label) }}<b v-if="field.required" aria-hidden="true"> *</b></span>
              <input
                :data-profile-field="field.key"
                :data-profile-initial-focus="field.key === 'fullName' ? '' : undefined"
                :type="field.type ?? 'text'"
                :value="state.draft.value[field.key]"
                :autocomplete="field.autocomplete"
                :aria-required="field.required"
                :aria-invalid="Boolean(errors[field.key])"
                :aria-describedby="errors[field.key] ? `profile-error-${field.key}` : undefined"
                :disabled="state.busy.value"
                @input="patch(field.key, $event)"
              >
              <small v-if="errors[field.key]" :id="`profile-error-${field.key}`" class="profile-field-error">{{ $t(errors[field.key]!) }}</small>
            </label>
          </div>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" :disabled="state.busy.value" @click="state.cancelEdit">{{ $t('取消') }}</button>
            <button class="primary-button" type="submit" :disabled="state.busy.value">
              {{ state.busy.value ? $t('正在保存…') : state.profile.value.syncStatus === 'clean' || state.profile.value.syncStatus === 'pending' ? $t('保存') : $t('重新应用本地修改') }}
            </button>
          </div>
        </form>

        <section v-else class="profile-view">
          <dl>
            <div v-for="field in PROFILE_FORM_FIELDS" :key="field.key"><dt>{{ $t(field.label) }}</dt><dd>{{ $t(value(field.key)) }}</dd></div>
          </dl>
          <div class="dialog-actions">
            <button class="secondary-button" type="button" data-profile-initial-focus @click="dismiss">{{ $t('关闭') }}</button>
            <button class="primary-button" type="button" @click="state.beginEdit">{{ $t('编辑') }}</button>
          </div>
        </section>
      </template>
    </section>
  </div>
</template>

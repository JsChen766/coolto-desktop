<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";

import {
  EXPERIENCE_KIND_LABELS,
  experienceKind,
  type ExperienceKind,
} from "../../../../experience/experience-kind";
import {
  cloneExperienceDraft,
  experienceFormErrors,
  normalizeExperienceTags,
  patchForExperienceKind,
  sameExperienceDraft,
  type ExperienceFormDraft,
  type ExperienceFormErrors,
} from "../experiences/experience-form";
import DialogSelect from "./DialogSelect.vue";
import type { DialogSelectOption } from "./dialog-select-types";
import ExperienceDateFields from "./ExperienceDateFields.vue";
import ExperienceTagEditor from "./ExperienceTagEditor.vue";
import { translate } from "../i18n/locale";

const props = defineProps<{
  mode: "create" | "edit";
  initial: ExperienceFormDraft;
  busy?: boolean;
  error?: string | undefined;
}>();
const emit = defineEmits<{
  cancel: [];
  dirty: [value: boolean];
  review: [draft: ExperienceFormDraft];
}>();

const form = ref(cloneExperienceDraft(props.initial));
const errors = ref<ExperienceFormErrors>({});
const formElement = ref<HTMLFormElement>();
const dirty = computed(() => !sameExperienceDraft(form.value, props.initial));
const errorList = computed(() => [...new Set(Object.values(errors.value))]);
const kind = computed(() => experienceKind(form.value));
const categoryOptions = computed<DialogSelectOption[]>(() =>
  Object.entries(EXPERIENCE_KIND_LABELS).map(([value, label]) => ({
    value,
    label: translate(label),
  })));

watch(dirty, (value) => emit("dirty", value), { immediate: true });

function patch(changes: Partial<ExperienceFormDraft>): void {
  form.value = { ...form.value, ...changes };
  for (const key of Object.keys(changes)) {
    delete errors.value[key as keyof ExperienceFormErrors];
  }
}

function updateTags(value: { tags: string[]; tagInput: string }): void {
  patch(value);
}

function updateKind(value: string): void {
  patch(patchForExperienceKind(value as ExperienceKind));
}

async function submit(): Promise<void> {
  form.value = {
    ...form.value,
    tags: normalizeExperienceTags(form.value.tags, form.value.tagInput),
    tagInput: "",
  };
  errors.value = experienceFormErrors(form.value);
  const firstField = Object.keys(errors.value)[0];
  if (firstField) {
    await nextTick();
    formElement.value
      ?.querySelector<HTMLElement>(`[data-field="${firstField}"]`)
      ?.focus();
    return;
  }
  emit("review", cloneExperienceDraft(form.value));
}
</script>

<template>
  <form
    ref="formElement"
    class="experience-editor"
    :aria-label="mode === 'create' ? $t('新建经历') : $t('编辑经历')"
    @submit.prevent="submit"
  >
    <header class="experience-editor-header">
      <div>
        <h2>{{ mode === "create" ? $t('新建经历') : $t('编辑经历') }}</h2>
        <p>{{ $t('保存前会先展示实际变化，确认后才写入本地同步队列。') }}</p>
      </div>
      <div class="experience-editor-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="busy"
          @click="$emit('cancel')"
        >
          {{ $t('取消') }}
        </button>
        <button
          class="primary-button"
          type="submit"
          :disabled="busy || (mode === 'edit' && !dirty)"
        >
          {{ busy ? $t('正在检查…') : $t('检查修改') }}
        </button>
      </div>
    </header>

    <div v-if="errorList.length" class="experience-form-error-summary" role="alert">
      <strong>{{ $t('请先修正以下内容') }}</strong>
      <span v-for="message in errorList" :key="message">{{ message }}</span>
    </div>
    <p v-if="error" class="tracker-dialog-error" role="alert">{{ error }}</p>

    <div class="experience-editor-scroll">
      <div class="experience-form-grid">
        <label class="experience-form-field">
          <span>{{ $t('类别') }}</span>
          <DialogSelect
            data-field="category"
            :model-value="kind"
            :options="categoryOptions"
            :disabled="busy"
            @update:model-value="updateKind"
          />
        </label>
        <label class="experience-form-field">
          <span>{{ $t('标题') }}</span>
          <input
            data-field="title"
            :value="form.title"
            :disabled="busy"
            autocomplete="off"
            @input="patch({ title: ($event.target as HTMLInputElement).value })"
          />
          <small v-if="errors.title" class="experience-field-error">{{ errors.title }}</small>
        </label>
      </div>

      <div v-if="kind !== 'skills'" class="experience-form-grid experience-form-grid-three">
        <label v-for="field in ['organization', 'role', 'location'] as const"
          :key="field" class="experience-form-field">
          <span>{{ field === "organization" ? $t('组织') : field === "role" ? $t('角色') : $t('地点') }}</span>
          <input
            :data-field="field"
            :value="form[field]"
            :disabled="busy"
            autocomplete="off"
            @input="patch({ [field]: ($event.target as HTMLInputElement).value })"
          />
          <small v-if="errors[field]" class="experience-field-error">{{ errors[field] }}</small>
        </label>
      </div>

      <ExperienceDateFields
        v-if="kind !== 'skills'"
        :draft="form"
        :errors="errors"
        :disabled="busy"
        @update="patch"
      />
      <ExperienceTagEditor
        :tags="form.tags"
        :input="form.tagInput"
        :errors="errors"
        :disabled="busy"
        @update="updateTags"
      />

      <label class="experience-form-field">
        <span>{{ $t('经历正文') }}</span>
        <textarea
          data-field="content"
          :value="form.content"
          :disabled="busy"
          rows="10"
          @input="patch({ content: ($event.target as HTMLTextAreaElement).value })"
        />
        <small v-if="errors.content" class="experience-field-error">{{ errors.content }}</small>
      </label>
    </div>
  </form>
</template>

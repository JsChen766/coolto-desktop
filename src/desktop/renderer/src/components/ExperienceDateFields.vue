<script setup lang="ts">
import type {
  EndDateMode,
  ExperienceFormDraft,
  ExperienceFormErrors,
  StartDateMode,
} from "../experiences/experience-form";
import DialogSelect from "./DialogSelect.vue";
import type { DialogSelectOption } from "./dialog-select-types";
import { translate } from "../i18n/locale";

const props = defineProps<{
  draft: ExperienceFormDraft;
  errors: ExperienceFormErrors;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  update: [changes: Partial<ExperienceFormDraft>];
}>();

const startModeOptions: DialogSelectOption[] = [
  { value: "none", label: translate("未填写") },
  { value: "month", label: translate("按月") },
  { value: "day", label: translate("精确到日") },
];

const endModeOptions: DialogSelectOption[] = [
  { value: "none", label: translate("未填写") },
  { value: "present", label: translate("至今") },
  { value: "month", label: translate("按月") },
  { value: "day", label: translate("精确到日") },
];

function setStartMode(value: string): void {
  emit("update", { startMode: value as StartDateMode, startValue: "" });
}

function setEndMode(value: string): void {
  emit("update", { endMode: value as EndDateMode, endValue: "" });
}
</script>

<template>
  <div class="experience-form-date-grid">
    <label class="experience-form-field">
      <span>{{ $t('开始时间') }}</span>
      <div class="experience-date-control">
        <DialogSelect
          data-field="startDate"
          :model-value="draft.startMode"
          :options="startModeOptions"
          :disabled="disabled"
          :aria-label="$t('开始时间精度')"
          @update:model-value="setStartMode"
        />
        <input
          v-if="draft.startMode === 'month'"
          type="month"
          :value="draft.startValue"
          :disabled="disabled"
          :aria-label="$t('开始月份')"
          @input="$emit('update', { startValue: ($event.target as HTMLInputElement).value })"
        />
        <input
          v-else-if="draft.startMode === 'day'"
          type="date"
          :value="draft.startValue"
          :disabled="disabled"
          :aria-label="$t('开始日期')"
          @input="$emit('update', { startValue: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <small v-if="errors.startDate" class="experience-field-error">
        {{ errors.startDate }}
      </small>
    </label>

    <label class="experience-form-field">
      <span>{{ $t('结束时间') }}</span>
      <div class="experience-date-control">
        <DialogSelect
          data-field="endDate"
          :model-value="draft.endMode"
          :options="endModeOptions"
          :disabled="disabled"
          :aria-label="$t('结束时间类型')"
          @update:model-value="setEndMode"
        />
        <input
          v-if="draft.endMode === 'month'"
          type="month"
          :value="draft.endValue"
          :disabled="disabled"
          :aria-label="$t('结束月份')"
          @input="$emit('update', { endValue: ($event.target as HTMLInputElement).value })"
        />
        <input
          v-else-if="draft.endMode === 'day'"
          type="date"
          :value="draft.endValue"
          :disabled="disabled"
          :aria-label="$t('结束日期')"
          @input="$emit('update', { endValue: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <small v-if="errors.endDate" class="experience-field-error">
        {{ errors.endDate }}
      </small>
    </label>
  </div>
</template>

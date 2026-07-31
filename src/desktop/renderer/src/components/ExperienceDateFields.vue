<script setup lang="ts">
import type {
  EndDateMode,
  ExperienceFormDraft,
  ExperienceFormErrors,
  StartDateMode,
} from "../experiences/experience-form";

const props = defineProps<{
  draft: ExperienceFormDraft;
  errors: ExperienceFormErrors;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  update: [changes: Partial<ExperienceFormDraft>];
}>();

function startMode(event: Event): void {
  emit("update", {
    startMode: (event.target as HTMLSelectElement).value as StartDateMode,
    startValue: "",
  });
}

function endMode(event: Event): void {
  emit("update", {
    endMode: (event.target as HTMLSelectElement).value as EndDateMode,
    endValue: "",
  });
}
</script>

<template>
  <div class="experience-form-date-grid">
    <label class="experience-form-field">
      <span>{{ $t('开始时间') }}</span>
      <div class="experience-date-control">
        <select
          data-field="startDate"
          :value="draft.startMode"
          :disabled="disabled"
          :aria-label="$t('开始时间精度')"
          @change="startMode"
        >
          <option value="none">{{ $t('未填写') }}</option>
          <option value="month">{{ $t('按月') }}</option>
          <option value="day">{{ $t('精确到日') }}</option>
        </select>
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
        <select
          data-field="endDate"
          :value="draft.endMode"
          :disabled="disabled"
          :aria-label="$t('结束时间类型')"
          @change="endMode"
        >
          <option value="none">{{ $t('未填写') }}</option>
          <option value="present">{{ $t('至今') }}</option>
          <option value="month">{{ $t('按月') }}</option>
          <option value="day">{{ $t('精确到日') }}</option>
        </select>
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

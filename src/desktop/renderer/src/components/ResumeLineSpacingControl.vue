<script setup lang="ts">
import { AlignVerticalSpaceAround, Minus, Plus } from "@lucide/vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
} from "vue";

import {
  RESUME_LINE_SPACING_DEFAULT_PERCENT,
  RESUME_LINE_SPACING_MAX_PERCENT,
  RESUME_LINE_SPACING_MIN_PERCENT,
  RESUME_LINE_SPACING_STEP_PERCENT,
} from "../../../../resume/layout-line-spacing";
import IconButton from "./IconButton.vue";

const props = defineProps<{
  value: number;
  maximum: number;
  disabled?: boolean;
  saving?: boolean;
}>();

const emit = defineEmits<{
  preview: [value: number];
  commit: [value: number];
  opened: [];
}>();

const root = ref<HTMLElement>();
const slider = ref<HTMLInputElement>();
const open = ref(false);
const attemptedBeyondLimit = ref(false);
const limited = computed(
  () => props.maximum < RESUME_LINE_SPACING_MAX_PERCENT,
);
const atLimit = computed(
  () => limited.value && props.value >= props.maximum,
);
const rangeStyle = computed(() => {
  const span = RESUME_LINE_SPACING_MAX_PERCENT - RESUME_LINE_SPACING_MIN_PERCENT;
  const current = ((props.value - RESUME_LINE_SPACING_MIN_PERCENT) / span) * 100;
  const safe = ((props.maximum - RESUME_LINE_SPACING_MIN_PERCENT) / span) * 100;
  return {
    "--spacing-current": `${current}%`,
    "--spacing-safe": `${safe}%`,
  };
});

onMounted(() => document.addEventListener("pointerdown", closeFromOutside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeFromOutside));

async function toggle(): Promise<void> {
  if (props.disabled) return;
  open.value = !open.value;
  attemptedBeyondLimit.value = false;
  if (!open.value) return;
  emit("opened");
  await nextTick();
  slider.value?.focus();
}

function closeFromOutside(event: PointerEvent): void {
  if (root.value?.contains(event.target as Node)) return;
  open.value = false;
}

function closeFromKeyboard(): void {
  open.value = false;
  root.value?.querySelector<HTMLButtonElement>("button")?.focus();
}

function readRequested(event: Event, commit: boolean): void {
  const requested = Number((event.target as HTMLInputElement).value);
  apply(requested, commit);
}

function apply(requested: number, commit: boolean): void {
  const allowed = Math.min(props.maximum, Math.max(
    RESUME_LINE_SPACING_MIN_PERCENT,
    requested,
  ));
  attemptedBeyondLimit.value = requested > props.maximum;
  emit("preview", allowed);
  if (commit) emit("commit", allowed);
}

function adjust(delta: number): void {
  apply(props.value + delta, true);
}

function reset(): void {
  apply(RESUME_LINE_SPACING_DEFAULT_PERCENT, true);
}
</script>

<template>
  <div ref="root" class="resume-line-spacing-control" @keydown.esc.stop="closeFromKeyboard">
    <IconButton
      :icon="AlignVerticalSpaceAround"
      :label="$t('调整行间距')"
      :active="open"
      :disabled="disabled"
      @click="toggle"
    />
    <div
      v-if="open"
      class="resume-line-spacing-popover"
      role="dialog"
      :aria-label="$t('调整行间距')"
    >
      <div class="resume-line-spacing-heading">
        <strong>{{ $t('行间距') }}</strong>
        <span>{{ value }}%</span>
      </div>
      <div class="resume-line-spacing-range-wrap">
        <span>{{ $t('紧凑') }}</span>
        <input
          ref="slider"
          type="range"
          :min="RESUME_LINE_SPACING_MIN_PERCENT"
          :max="RESUME_LINE_SPACING_MAX_PERCENT"
          :step="RESUME_LINE_SPACING_STEP_PERCENT"
          :value="value"
          :disabled="disabled || saving"
          :aria-label="$t('行间距')"
          :aria-valuetext="`${value}%`"
          :style="rangeStyle"
          @input="readRequested($event, false)"
          @change="readRequested($event, true)"
        />
        <span>{{ $t('宽松') }}</span>
      </div>
      <div class="resume-line-spacing-actions">
        <button
          type="button"
          :aria-label="$t('减小行间距')"
          :disabled="disabled || saving || value <= RESUME_LINE_SPACING_MIN_PERCENT"
          @click="adjust(-RESUME_LINE_SPACING_STEP_PERCENT)"
        >
          <Minus :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <button type="button" :disabled="disabled || saving" @click="reset">
          {{ $t('还原默认') }}
        </button>
        <button
          type="button"
          :aria-label="$t('增大行间距')"
          :disabled="disabled || saving || value >= maximum"
          @click="adjust(RESUME_LINE_SPACING_STEP_PERCENT)"
        >
          <Plus :size="14" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
      <p
        v-if="atLimit || attemptedBeyondLimit"
        class="resume-line-spacing-warning"
        role="status"
        aria-live="polite"
      >
        {{ $t('继续增大将超过一页，已到达当前安全上限') }}
      </p>
      <p v-else-if="saving" class="resume-line-spacing-saving" role="status">
        {{ $t('正在保存行间距…') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check, ChevronDown } from "@lucide/vue";
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";

import type { DialogSelectOption } from "./dialog-select-types";
import { useAnchoredPopoverPosition } from "../composables/use-anchored-popover-position";

const props = withDefaults(defineProps<{
  modelValue: string;
  options: DialogSelectOption[];
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  ariaLabel?: string;
  placeholder?: string;
}>(), {
  placeholder: "",
});

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

defineOptions({ inheritAttrs: false });

const root = ref<HTMLElement>();
const trigger = ref<HTMLButtonElement>();
const open = ref(false);
const focusedIndex = ref(-1);
const listId = useId();

const selected = computed(() => props.options.find((option) => option.value === props.modelValue));
const triggerLabel = computed(() => selected.value?.label ?? props.placeholder);

const { menuStyle, syncPosition } = useAnchoredPopoverPosition(trigger, open);

onMounted(() => document.addEventListener("pointerdown", onPointerDown, true));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onPointerDown, true));

watch(() => props.options, () => {
  if (!open.value) return;
  void nextTick(syncPosition);
});

function onPointerDown(event: PointerEvent): void {
  if (!open.value || !event.isTrusted) return;
  const target = event.target as Node;
  if (root.value?.contains(target)) return;
  if ((target as Element).closest?.(".dialog-select-menu")) return;
  open.value = false;
}

async function toggle(): Promise<void> {
  if (props.disabled) return;
  open.value = !open.value;
  if (!open.value) {
    focusedIndex.value = -1;
    return;
  }
  const current = props.options.findIndex((option) => option.value === props.modelValue);
  focusedIndex.value = current >= 0 ? current : props.options.findIndex((option) => !option.disabled);
  await nextTick();
  await nextTick();
  syncPosition();
  scrollFocusedIntoView();
}

function close(focusTrigger = true): void {
  open.value = false;
  focusedIndex.value = -1;
  if (focusTrigger) trigger.value?.focus();
}

function pick(value: string): void {
  if (props.modelValue !== value) emit("update:modelValue", value);
  close();
}

function moveFocus(delta: number): void {
  const total = props.options.length;
  if (!total) return;
  let index = focusedIndex.value < 0 ? 0 : focusedIndex.value;
  for (let step = 0; step < total; step += 1) {
    index = (index + delta + total) % total;
    if (!props.options[index]?.disabled) break;
  }
  focusedIndex.value = index;
  scrollFocusedIntoView();
}

function scrollFocusedIntoView(): void {
  document.getElementById(listId)?.querySelector<HTMLElement>(`[data-index="${focusedIndex.value}"]`)
    ?.scrollIntoView({ block: "nearest" });
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) return;
  if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (!open.value) void toggle();
    else if (event.key === "ArrowDown") moveFocus(1);
    else if (event.key === "ArrowUp") moveFocus(-1);
    else if (focusedIndex.value >= 0) pick(props.options[focusedIndex.value]!.value);
    return;
  }
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}

function onListKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveFocus(1);
    return;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveFocus(-1);
    return;
  }
  if (event.key === "Home") {
    event.preventDefault();
    focusedIndex.value = props.options.findIndex((option) => !option.disabled);
    scrollFocusedIntoView();
    return;
  }
  if (event.key === "End") {
    event.preventDefault();
    for (let index = props.options.length - 1; index >= 0; index -= 1) {
      if (!props.options[index]?.disabled) {
        focusedIndex.value = index;
        break;
      }
    }
    scrollFocusedIntoView();
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (focusedIndex.value >= 0) pick(props.options[focusedIndex.value]!.value);
  }
}
</script>

<template>
  <div ref="root" class="dialog-select">
    <button
      ref="trigger"
      type="button"
      class="dialog-select-trigger"
      :class="{ invalid }"
      :disabled="disabled"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-controls="listId"
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy || undefined"
      :aria-label="ariaLabel"
      v-bind="$attrs"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span :class="{ 'dialog-select-placeholder': !selected }">{{ triggerLabel }}</span>
      <ChevronDown class="dialog-select-chevron" :size="14" :stroke-width="2" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <ul
        v-if="open"
        :id="listId"
        class="dialog-select-menu popover"
        role="listbox"
        :style="menuStyle"
        :aria-label="ariaLabel"
        tabindex="-1"
        @keydown="onListKeydown"
      >
        <li
          v-for="(option, index) in options"
          :key="`${option.value}-${index}`"
          role="option"
          :data-index="index"
          :aria-selected="option.value === modelValue"
          :aria-disabled="option.disabled || undefined"
        >
          <button
            type="button"
            class="dialog-select-option"
            :class="{ selected: option.value === modelValue, focused: index === focusedIndex }"
            :disabled="option.disabled"
            @click="pick(option.value)"
            @mouseenter="focusedIndex = index"
          >
            <Check class="dialog-select-check" :size="14" :stroke-width="2.2" aria-hidden="true" />
            <span>{{ option.label }}</span>
          </button>
        </li>
      </ul>
    </Teleport>
  </div>
</template>

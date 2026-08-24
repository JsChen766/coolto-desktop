<script setup lang="ts">
import { ArrowRight, Check, LoaderCircle, MessageSquareText, ShieldCheck, X } from "@lucide/vue";
import { nextTick, shallowRef, useTemplateRef } from "vue";

import type { DesktopApprovalDecision, DesktopApprovalRequest } from "@desktop/types";

defineProps<{ request: DesktopApprovalRequest; busy?: boolean }>();
const emit = defineEmits<{ decide: [decision: DesktopApprovalDecision] }>();
const editing = shallowRef(false);
const instruction = shallowRef("");
const input = useTemplateRef<HTMLTextAreaElement>("instructionInput");

async function edit(): Promise<void> {
  editing.value = true;
  await nextTick();
  input.value?.focus();
}

function submitEdit(): void {
  const text = instruction.value.trim();
  if (text) emit("decide", { type: "custom", text });
}
</script>

<template>
  <section class="delegation-panel" data-testid="delegation-panel">
    <header class="delegation-heading">
      <span class="shield-mark"><ShieldCheck :size="19" :stroke-width="1.8" aria-hidden="true" /></span>
      <div><p>{{ $t('Delegation Grant') }}</p><h3>{{ $t(request.title) }}</h3>
        <span>{{ busy ? $t('正在建立本机任务…') : $t('确认后授权范围不可静默扩大') }}</span></div>
    </header>
    <p class="delegation-description">{{ $t(request.description) }}</p>
    <dl class="delegation-facts">
      <template v-for="field in request.preview.summary" :key="field.label">
        <dt>{{ $t(field.label) }}</dt><dd>{{ field.value }}</dd>
      </template>
    </dl>
    <div class="delegation-warnings">
      <p v-for="warning in request.preview.warnings ?? []" :key="warning">{{ $t(warning) }}</p>
    </div>
    <div class="delegation-actions">
      <button class="allow-button" type="button" :disabled="busy" @click="emit('decide', { type: 'accept' })">
        <LoaderCircle v-if="busy" class="spin" :size="16" aria-hidden="true" />
        <Check v-else :size="16" aria-hidden="true" />
        {{ busy ? $t('正在确认…') : $t('允许并启动任务') }}
        <ArrowRight :size="15" aria-hidden="true" />
      </button>
      <button type="button" :disabled="busy" @click="edit"><MessageSquareText :size="15" aria-hidden="true" />{{ $t('修改范围') }}</button>
      <button type="button" :disabled="busy" @click="emit('decide', { type: 'reject' })"><X :size="15" aria-hidden="true" />{{ $t('取消') }}</button>
    </div>
    <div v-if="editing" class="delegation-edit">
      <textarea ref="instructionInput" v-model="instruction" rows="3" :placeholder="$t('告诉 Agent 要如何缩小或修改授权范围…')" />
      <button type="button" :disabled="!instruction.trim() || busy" @click="submitEdit">{{ $t('交给 Agent 修改') }}</button>
    </div>
  </section>
</template>

<style scoped>
.delegation-panel { width: min(680px, 100%); margin: 14px 0; padding: 18px; border-radius: 13px; background: var(--surface); }
.delegation-heading { display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: start; }
.shield-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--surface-strong); }
.delegation-heading p, .delegation-heading h3, .delegation-heading span { margin: 0; }
.delegation-heading p { color: var(--muted); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.delegation-heading h3 { margin-top: 2px; font-size: 16px; } .delegation-heading span { color: var(--muted); font-size: 12px; }
.delegation-description { margin: 14px 0; color: var(--text-soft); }
.delegation-facts { display: grid; grid-template-columns: 118px minmax(0, 1fr); gap: 8px 16px; margin: 0; }
.delegation-facts dt { color: var(--muted); } .delegation-facts dd { margin: 0; overflow-wrap: anywhere; }
.delegation-warnings { margin-top: 14px; color: var(--muted); font-size: 12px; }
.delegation-warnings p { margin: 4px 0; }
.delegation-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.delegation-actions button, .delegation-edit button { display: inline-flex; align-items: center; gap: 7px; padding: 8px 11px;
  border: 0; border-radius: 8px; background: var(--surface-strong); color: var(--text); cursor: pointer; }
.delegation-actions .allow-button { background: var(--text); color: var(--bg); }
.delegation-edit { display: grid; gap: 8px; margin-top: 12px; }
.delegation-edit textarea { resize: vertical; border: 1px solid var(--border); border-radius: 8px; padding: 9px;
  background: transparent; color: var(--text); font: inherit; }
.delegation-edit button { justify-self: end; }
@media (max-width: 560px) { .delegation-facts { grid-template-columns: 1fr; gap: 3px; } .delegation-facts dd { margin-bottom: 8px; } }
</style>

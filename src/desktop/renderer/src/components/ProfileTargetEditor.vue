<script setup lang="ts">
import { Plus, Star, Trash2 } from "@lucide/vue";
import type { ProfileTargetDraft } from "../profile/profile-form";

const props = defineProps<{
  targets: ProfileTargetDraft[];
  disabled?: boolean;
  error?: string | undefined;
}>();
const emit = defineEmits<{
  add: [];
  remove: [id: string];
  primary: [id: string];
  update: [id: string, field: "role" | "industries" | "locations", value: string];
}>();

function patch(
  target: ProfileTargetDraft,
  field: "role" | "industries" | "locations",
  event: Event,
): void {
  emit("update", target.id, field, (event.target as HTMLInputElement).value);
}
</script>

<template>
  <section class="profile-targets" aria-labelledby="profile-targets-title">
    <div class="profile-subsection-heading">
      <div>
        <h3 id="profile-targets-title">{{ $t('求职目标') }}</h3>
        <p>{{ $t('可设置多个方向；主要目标只用于表达当前优先级，不会创建 JD 关系。') }}</p>
      </div>
      <button class="small-secondary-button icon-label" type="button" :disabled="disabled || targets.length >= 20" @click="emit('add')">
        <Plus :size="14" :stroke-width="1.9" aria-hidden="true" />
        <span>{{ $t('添加目标') }}</span>
      </button>
    </div>
    <p v-if="!targets.length" class="profile-target-empty">{{ $t('还没有目标，可稍后再补充。') }}</p>
    <div v-for="target in targets" :key="target.id" class="profile-target-row">
      <div class="profile-target-fields">
        <label>
          <span>{{ $t('岗位') }}</span>
          <input :value="target.role" maxlength="120" :disabled="disabled" @input="patch(target, 'role', $event)">
        </label>
        <label>
          <span>{{ $t('行业（逗号分隔）') }}</span>
          <input :value="target.industries" maxlength="600" :disabled="disabled" @input="patch(target, 'industries', $event)">
        </label>
        <label>
          <span>{{ $t('地点（逗号分隔）') }}</span>
          <input :value="target.locations" maxlength="600" :disabled="disabled" @input="patch(target, 'locations', $event)">
        </label>
      </div>
      <div class="profile-target-actions">
        <span v-if="target.isPrimary" class="profile-primary-label icon-label"><Star :size="14" :stroke-width="1.8" aria-hidden="true" />{{ $t('主要目标') }}</span>
        <button v-else class="small-secondary-button" type="button" :disabled="disabled" @click="emit('primary', target.id)">{{ $t('设为主要目标') }}</button>
        <button class="icon-button" type="button" :disabled="disabled" :aria-label="$tf('删除目标 {role}', { role: target.role || $t('未命名') })" :title="$tf('删除目标 {role}', { role: target.role || $t('未命名') })" @click="emit('remove', target.id)">
          <Trash2 :size="15" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </div>
    </div>
    <p v-if="error" class="profile-field-error" role="alert">{{ error }}</p>
  </section>
</template>

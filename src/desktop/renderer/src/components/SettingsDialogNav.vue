<script setup lang="ts">
import {
  IdCard,
  Link2,
  MessageSquareText,
  Radar,
  ShieldCheck,
  SlidersHorizontal,
} from "@lucide/vue";

export type SettingsNavId =
  | "profile"
  | "connections"
  | "automation"
  | "privacy"
  | "preferences"
  | "help";

const props = defineProps<{ active: SettingsNavId }>();
const emit = defineEmits<{ select: [id: SettingsNavId] }>();

const items: { id: SettingsNavId; label: string; icon: typeof IdCard }[] = [
  { id: "profile", label: "个人档案", icon: IdCard },
  { id: "connections", label: "连接与日程", icon: Link2 },
  { id: "automation", label: "自动化", icon: Radar },
  { id: "privacy", label: "隐私与数据", icon: ShieldCheck },
  { id: "preferences", label: "偏好", icon: SlidersHorizontal },
  { id: "help", label: "帮助与反馈", icon: MessageSquareText },
];
</script>

<template>
  <nav class="settings-dialog-nav" :aria-label="$t('设置分类')">
    <ul>
      <li v-for="item in items" :key="item.id">
        <button
          type="button"
          class="settings-dialog-nav-item"
          :class="{ active: props.active === item.id }"
          :aria-current="props.active === item.id ? 'page' : undefined"
          :data-settings-nav="item.id"
          @click="emit('select', item.id)"
        >
          <component :is="item.icon" :size="15" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ $t(item.label) }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup lang="ts">
import {
  Ellipsis,
  LogOut,
  Moon,
  Settings2,
  SquarePen,
  Sun,
} from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

import type {
  ConversationSummary,
  DesktopUser,
} from "@desktop/types";

const props = defineProps<{
  conversations: ConversationSummary[];
  currentId: string | undefined;
  user: DesktopUser;
  dark: boolean;
}>();

const emit = defineEmits<{
  create: [];
  select: [conversationId: string];
  rename: [conversation: ConversationSummary];
  delete: [conversation: ConversationSummary];
  toggleTheme: [];
  logout: [];
}>();

const openMenuId = ref<string>();
const userMenuOpen = ref(false);

function relativeTime(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function toggleConversationMenu(
  event: MouseEvent,
  conversationId: string,
): void {
  event.stopPropagation();
  openMenuId.value =
    openMenuId.value === conversationId ? undefined : conversationId;
  userMenuOpen.value = false;
}

function closeMenus(): void {
  openMenuId.value = undefined;
  userMenuOpen.value = false;
}

function runConversationAction(
  action: "rename" | "delete",
  conversation: ConversationSummary,
): void {
  closeMenus();
  if (action === "rename") {
    emit("rename", conversation);
  } else {
    emit("delete", conversation);
  }
}

onMounted(() => window.addEventListener("click", closeMenus));
onBeforeUnmount(() => window.removeEventListener("click", closeMenus));
</script>

<template>
  <aside class="sidebar">
    <header class="sidebar-header window-drag">
      <div class="brand-row">
        <span>Coolto</span>
      </div>
    </header>

    <button class="new-chat-button icon-label" type="button" @click="$emit('create')">
      <SquarePen :size="16" :stroke-width="1.8" aria-hidden="true" />
      <span>新对话</span>
    </button>

    <section class="sidebar-section conversation-section">
      <p class="section-label">对话历史</p>
      <div class="conversation-scroll">
        <p v-if="conversations.length === 0" class="sidebar-empty">
          暂无对话
        </p>
        <div
          v-for="conversation in conversations"
          :key="conversation.id"
          class="conversation-row"
          :class="{ active: conversation.id === currentId }"
          role="button"
          tabindex="0"
          @click="$emit('select', conversation.id)"
          @keydown.enter="$emit('select', conversation.id)"
          @keydown.space.prevent="$emit('select', conversation.id)"
        >
          <span class="conversation-title">{{ conversation.title }}</span>
          <span class="conversation-slot">
            <span class="conversation-time">
              {{ relativeTime(conversation.updatedAt) }}
            </span>
            <button
              class="conversation-more"
              type="button"
              aria-label="对话选项"
              title="对话选项"
              @click="toggleConversationMenu($event, conversation.id)"
            >
              <Ellipsis :size="15" :stroke-width="1.9" aria-hidden="true" />
            </button>
            <div
              v-if="openMenuId === conversation.id"
              class="popover conversation-menu"
              @click.stop
            >
              <button
                type="button"
                @click="runConversationAction('rename', conversation)"
              >
                重命名
              </button>
              <button
                class="danger-text"
                type="button"
                @click="runConversationAction('delete', conversation)"
              >
                删除
              </button>
            </div>
          </span>
        </div>
      </div>
    </section>

    <div class="sidebar-footer">
      <div class="user-row">
        <div class="user-avatar" aria-hidden="true">
          {{ user.email.slice(0, 1).toUpperCase() }}
        </div>
        <div class="user-copy">
          <span class="user-email">{{ user.email }}</span>
          <span>已登录</span>
        </div>
        <button
          class="user-menu-trigger"
          type="button"
          aria-label="账户与设置"
          title="账户与设置"
          @click.stop="userMenuOpen = !userMenuOpen; openMenuId = undefined"
        >
          <Ellipsis :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <div v-if="userMenuOpen" class="popover user-menu" @click.stop>
          <button class="menu-row icon-label" type="button" @click="$emit('toggleTheme')">
            <Sun v-if="dark" :size="16" :stroke-width="1.8" aria-hidden="true" />
            <Moon v-else :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ dark ? "切换浅色模式" : "切换深色模式" }}</span>
          </button>
          <button class="menu-row icon-label" type="button" disabled>
            <Settings2 :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>设置</span>
          </button>
          <div class="menu-divider" />
          <button
            class="menu-row icon-label"
            type="button"
            @click="$emit('logout')"
          >
            <LogOut :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

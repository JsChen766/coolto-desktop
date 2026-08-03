<script setup lang="ts">
import {
  Ellipsis,
  FileText,
  IdCard,
  Languages,
  LogOut,
  Moon,
  Sun,
} from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

import type {
  ConversationSummary,
  DesktopUser,
} from "@desktop/types";
import type { ResumeDraftSummary } from "../../../../resume/draft/types";
import { relativeTime } from "../lib/relative-time";
import { appLocale, toggleLocale } from "../i18n/locale";
import SidebarPrimaryNavigation from "./SidebarPrimaryNavigation.vue";

const props = defineProps<{
  conversations: ConversationSummary[];
  currentId: string | undefined;
  user: DesktopUser;
  dark: boolean;
  resumeDrafts: ResumeDraftSummary[];
  currentDraftId: string | undefined;
  activeView: "chat" | "experiences" | "library" | "tracker";
}>();

const emit = defineEmits<{
  create: [];
  openExperiences: [];
  select: [conversationId: string];
  selectDraft: [artifactId: string];
  openLibrary: [];
  openTracker: [];
  rename: [conversation: ConversationSummary];
  delete: [conversation: ConversationSummary];
  toggleTheme: [];
  openProfile: [trigger: HTMLElement];
  logout: [];
}>();

const openMenuId = ref<string>();
const userMenuOpen = ref(false);
const userMenuTrigger = ref<HTMLButtonElement>();

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

function toggleLanguage(): void {
  toggleLocale();
  closeMenus();
}

function openProfile(): void {
  if (!userMenuTrigger.value) return;
  closeMenus();
  emit("openProfile", userMenuTrigger.value);
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

    <SidebarPrimaryNavigation
      :active-view="activeView"
      @create="$emit('create')"
      @open-experiences="$emit('openExperiences')"
      @open-library="$emit('openLibrary')"
      @open-tracker="$emit('openTracker')"
    />

    <section class="sidebar-section resume-draft-section">
      <p class="section-label">{{ $t('本地简历') }}</p>
      <div class="resume-draft-list">
        <p v-if="resumeDrafts.length === 0" class="sidebar-empty">
          {{ $t('暂无本地简历') }}
        </p>
        <button
          v-for="draft in resumeDrafts"
          :key="draft.artifactId"
          class="resume-draft-row"
          :class="{ active: draft.artifactId === currentDraftId }"
          type="button"
          @click="$emit('selectDraft', draft.artifactId)"
        >
          <FileText :size="14" :stroke-width="1.8" aria-hidden="true" />
          <span>{{ draft.title }}</span>
          <i
            class="resume-draft-state"
            :class="draft.cloudState"
            :title="
              draft.cloudState === 'synced'
                ? $t('已同步云端')
                : draft.cloudState === 'local_changes'
                  ? $t('有未同步修改')
                  : $t('仅保存在本机')
            "
          />
        </button>
      </div>
    </section>

    <section class="sidebar-section conversation-section">
      <p class="section-label">{{ $t('对话历史') }}</p>
      <div class="conversation-scroll">
        <p v-if="conversations.length === 0" class="sidebar-empty">
          {{ $t('暂无对话') }}
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
          <span class="conversation-title">{{ conversation.title === "新对话" ? $t('新对话') : conversation.title }}</span>
          <span class="conversation-slot">
            <span class="conversation-time">
              {{ relativeTime(conversation.updatedAt) }}
            </span>
            <button
              class="conversation-more"
              type="button"
              :aria-label="$t('对话选项')"
              :title="$t('对话选项')"
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
                {{ $t('重命名') }}
              </button>
              <button
                class="danger-text"
                type="button"
                @click="runConversationAction('delete', conversation)"
              >
                {{ $t('删除') }}
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
          <span>{{ $t('已登录') }}</span>
        </div>
        <button
          class="user-menu-trigger"
          ref="userMenuTrigger"
          type="button"
          :aria-label="$t('账户菜单')"
          :title="$t('账户菜单')"
          @click.stop="userMenuOpen = !userMenuOpen; openMenuId = undefined"
        >
          <Ellipsis :size="17" :stroke-width="1.8" aria-hidden="true" />
        </button>
        <div v-if="userMenuOpen" class="popover user-menu" @click.stop>
          <button class="menu-row icon-label" type="button" @click="$emit('toggleTheme')">
            <Sun v-if="dark" :size="16" :stroke-width="1.8" aria-hidden="true" />
            <Moon v-else :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ dark ? $t('切换浅色模式') : $t('切换深色模式') }}</span>
          </button>
          <button class="menu-row icon-label" type="button" @click="toggleLanguage">
            <Languages :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ appLocale === "zh-CN" ? $t('切换到英文') : 'Switch to Chinese' }}</span>
          </button>
          <button
            class="menu-row icon-label"
            type="button"
            @click="openProfile"
          >
            <IdCard :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ $t('个人信息') }}</span>
          </button>
          <div class="menu-divider" />
          <button
            class="menu-row icon-label"
            type="button"
            @click="$emit('logout')"
          >
            <LogOut :size="16" :stroke-width="1.8" aria-hidden="true" />
            <span>{{ $t('退出登录') }}</span>
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>

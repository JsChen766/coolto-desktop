<script setup lang="ts">
import { Ellipsis, FileText } from "@lucide/vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

import type {
  AppUpdateState,
  ConversationSummary,
  DesktopUser,
} from "@desktop/types";
import type { ResumeDraftSummary } from "../../../../resume/draft/types";
import { relativeTime } from "../lib/relative-time";
import SidebarPrimaryNavigation from "./SidebarPrimaryNavigation.vue";
import UserAccountMenu from "./UserAccountMenu.vue";

defineProps<{
  conversations: ConversationSummary[];
  currentId: string | undefined;
  user: DesktopUser;
  dark: boolean;
  resumeDrafts: ResumeDraftSummary[];
  currentDraftId: string | undefined;
  activeView: "chat" | "experiences" | "library" | "tracker";
  generating: boolean;
  updateState: AppUpdateState;
  updateChecking: boolean;
  updateUpToDate: boolean;
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
  openSettings: [];
  checkUpdate: [];
  installUpdate: [];
  logout: [];
}>();

const openMenuId = ref<string>();

function toggleConversationMenu(
  event: MouseEvent,
  conversationId: string,
): void {
  event.stopPropagation();
  openMenuId.value =
    openMenuId.value === conversationId ? undefined : conversationId;
}

function closeMenus(): void {
  openMenuId.value = undefined;
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
      :generating="generating"
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
          :disabled="generating"
          :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
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
          :class="{ active: conversation.id === currentId, disabled: generating }"
          role="button"
          tabindex="0"
          :aria-disabled="generating"
          :title="generating ? $t('正在生成中，完成或停止后再切换') : undefined"
          @click="!generating && $emit('select', conversation.id)"
          @keydown.enter="!generating && $emit('select', conversation.id)"
          @keydown.space.prevent="!generating && $emit('select', conversation.id)"
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
      <UserAccountMenu
        :user="user"
        :dark="dark"
        :open="openMenuId === 'user'"
        :update-state="updateState"
        :update-checking="updateChecking"
        :update-up-to-date="updateUpToDate"
        @toggle="openMenuId = openMenuId === 'user' ? undefined : 'user'"
        @close="openMenuId = undefined"
        @toggle-theme="$emit('toggleTheme')"
        @open-profile="$emit('openProfile', $event)"
        @open-settings="$emit('openSettings')"
        @check-update="$emit('checkUpdate')"
        @install-update="$emit('installUpdate')"
        @logout="$emit('logout')"
      />
    </div>
  </aside>
</template>

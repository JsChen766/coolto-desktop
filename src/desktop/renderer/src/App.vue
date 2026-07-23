<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  DesktopAgentEvent,
  DesktopApprovalDecision,
  DesktopApprovalRequest,
  DesktopUser,
} from "@desktop/types";
import ApprovalCard from "./components/ApprovalCard.vue";
import ArtifactPanel from "./components/ArtifactPanel.vue";
import ChatHeader from "./components/ChatHeader.vue";
import ChatMessageView from "./components/ChatMessage.vue";
import Composer from "./components/Composer.vue";
import ConversationDialog from "./components/ConversationDialog.vue";
import EmptyState from "./components/EmptyState.vue";
import LoginScreen from "./components/LoginScreen.vue";
import MarkdownContent from "./components/MarkdownContent.vue";
import Sidebar from "./components/Sidebar.vue";
import ToolActivity, {
  type ToolRun,
} from "./components/ToolActivity.vue";
import { desktopApi } from "./lib/desktop-api";

const booting = ref(true);
const user = ref<DesktopUser>();
const loginBusy = ref(false);
const loginError = ref<string>();
const conversations = ref<ConversationSummary[]>([]);
const current = ref<ConversationDetail>();
const sidebarOpen = ref(true);
const artifactOpen = ref(false);
const running = ref(false);
const streamingText = ref("");
const runError = ref<string>();
const toolRuns = ref<ToolRun[]>([]);
const pendingApproval = ref<DesktopApprovalRequest>();
const approvalBusy = ref(false);
const scroller = ref<HTMLElement>();
const dark = ref(localStorage.getItem("coolto-theme") === "dark");
const dialog = ref<{
  mode: "rename" | "delete";
  conversation: ConversationSummary;
}>();
const approvalByConversation = new Map<string, DesktopApprovalRequest>();
let unsubscribeEvents: (() => void) | undefined;

onMounted(async () => {
  applyTheme();
  unsubscribeEvents = desktopApi.agent.onEvent(handleAgentEvent);
  try {
    user.value = await desktopApi.auth.getCurrentUser();
    if (user.value) {
      await loadConversations();
    }
  } catch (error: unknown) {
    loginError.value = errorMessage(error);
  } finally {
    booting.value = false;
  }
});

onBeforeUnmount(() => unsubscribeEvents?.());

watch(
  [() => current.value?.messages.length, streamingText, pendingApproval],
  () => void nextTick(scrollToBottom),
);

async function login(email: string, password: string): Promise<void> {
  loginBusy.value = true;
  loginError.value = undefined;
  try {
    user.value = await desktopApi.auth.login(email, password);
    await loadConversations();
  } catch (error: unknown) {
    loginError.value = errorMessage(error);
  } finally {
    loginBusy.value = false;
  }
}

async function logout(): Promise<void> {
  if (running.value) {
    await desktopApi.agent.cancel();
  }
  await desktopApi.auth.logout();
  user.value = undefined;
  current.value = undefined;
  conversations.value = [];
  approvalByConversation.clear();
  clearRunState();
}

async function loadConversations(): Promise<void> {
  conversations.value = await desktopApi.conversations.list();
  const first = conversations.value[0];
  if (first) {
    await selectConversation(first.id);
  } else {
    await createConversation();
  }
}

async function refreshConversationList(): Promise<void> {
  conversations.value = await desktopApi.conversations.list();
}

async function createConversation(): Promise<void> {
  if (running.value) return;
  current.value = await desktopApi.conversations.create();
  clearRunState();
  pendingApproval.value = undefined;
  await refreshConversationList();
  await nextTick(scrollToBottom);
}

async function selectConversation(conversationId: string): Promise<void> {
  if (running.value || current.value?.id === conversationId) return;
  current.value = await desktopApi.conversations.get(conversationId);
  clearRunState();
  pendingApproval.value = approvalByConversation.get(conversationId);
  await nextTick(scrollToBottom);
}

function openDialog(
  mode: "rename" | "delete",
  conversation: ConversationSummary,
): void {
  dialog.value = { mode, conversation };
}

async function confirmDialog(value?: string): Promise<void> {
  const active = dialog.value;
  if (!active) return;
  if (active.mode === "rename") {
    await desktopApi.conversations.rename({
      conversationId: active.conversation.id,
      title: value?.trim() ?? "",
    });
    if (current.value?.id === active.conversation.id && value?.trim()) {
      current.value.title = value.trim();
    }
  } else {
    await desktopApi.conversations.delete(active.conversation.id);
    approvalByConversation.delete(active.conversation.id);
    if (current.value?.id === active.conversation.id) {
      current.value = undefined;
    }
  }
  dialog.value = undefined;
  await refreshConversationList();
  if (!current.value) {
    const next = conversations.value[0];
    if (next) {
      await selectConversation(next.id);
    } else {
      await createConversation();
    }
  }
}

async function send(text: string): Promise<void> {
  if (!current.value || running.value) return;
  const conversationId = current.value.id;
  const optimistic: ChatMessage = {
    id: `pending-${crypto.randomUUID()}`,
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
  };
  current.value.messages.push(optimistic);
  running.value = true;
  streamingText.value = "";
  runError.value = undefined;
  toolRuns.value = [];
  pendingApproval.value = undefined;
  try {
    current.value = await desktopApi.agent.prompt({
      conversationId,
      text,
    });
    await refreshConversationList();
  } catch (error: unknown) {
    runError.value = errorMessage(error);
  } finally {
    running.value = false;
  }
}

async function resolveApproval(
  decision: DesktopApprovalDecision,
): Promise<void> {
  if (!current.value || !pendingApproval.value) return;
  approvalBusy.value = true;
  try {
    current.value = await desktopApi.agent.resolveApproval({
      conversationId: current.value.id,
      requestId: pendingApproval.value.id,
      decision,
    });
    pendingApproval.value = undefined;
    await refreshConversationList();
  } catch (error: unknown) {
    runError.value = errorMessage(error);
  } finally {
    approvalBusy.value = false;
  }
}

function handleAgentEvent(
  conversationId: string,
  event: DesktopAgentEvent,
): void {
  if (event.type === "approval.required") {
    approvalByConversation.set(conversationId, event.request);
    if (conversationId === current.value?.id) {
      pendingApproval.value = event.request;
    }
    return;
  }
  if (event.type === "approval.resolved") {
    approvalByConversation.delete(conversationId);
    if (
      conversationId === current.value?.id &&
      pendingApproval.value?.id === event.requestId
    ) {
      pendingApproval.value = undefined;
    }
    return;
  }
  if (conversationId !== current.value?.id) return;
  switch (event.type) {
    case "run.started":
      running.value = true;
      return;
    case "message.delta":
      streamingText.value += event.text;
      return;
    case "tool.started":
      toolRuns.value.push({
        callId: event.callId,
        name: event.name,
        status: "running",
      });
      return;
    case "tool.completed": {
      const run = toolRuns.value.find(
        (candidate) => candidate.callId === event.callId,
      );
      if (run) {
        run.status = event.isError ? "error" : "completed";
      }
      return;
    }
    case "approval.failed":
      runError.value = event.message;
      return;
    case "run.failed":
      runError.value = event.message;
      running.value = false;
      return;
    case "run.completed":
      running.value = false;
      return;
    default:
      return;
  }
}

function clearRunState(): void {
  streamingText.value = "";
  runError.value = undefined;
  toolRuns.value = [];
  pendingApproval.value = undefined;
  approvalBusy.value = false;
}

function toggleTheme(): void {
  dark.value = !dark.value;
  localStorage.setItem("coolto-theme", dark.value ? "dark" : "light");
  applyTheme();
}

function applyTheme(): void {
  document.documentElement.classList.toggle("dark", dark.value);
}

function scrollToBottom(): void {
  scroller.value?.scrollTo({
    top: scroller.value.scrollHeight,
    behavior: "smooth",
  });
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/u, "")
    .replace(/^Error:\s*/u, "");
}
</script>

<template>
  <div v-if="booting" class="boot-screen">
    <div class="boot-pulse" />
  </div>

  <LoginScreen
    v-else-if="!user"
    :busy="loginBusy"
    :error="loginError"
    @submit="login"
  />

  <div
    v-else
    class="app-shell"
    :class="[`platform-${desktopApi.platform}`, { 'sidebar-hidden': !sidebarOpen }]"
  >
    <Sidebar
      v-if="sidebarOpen"
      :conversations="conversations"
      :current-id="current?.id"
      :user="user"
      :dark="dark"
      @create="createConversation"
      @select="selectConversation"
      @rename="openDialog('rename', $event)"
      @delete="openDialog('delete', $event)"
      @toggle-theme="toggleTheme"
      @logout="logout"
    />

    <main class="main-workspace">
      <ChatHeader
        :title="current?.title ?? '新对话'"
        :sidebar-open="sidebarOpen"
        :artifact-open="artifactOpen"
        :platform="desktopApi.platform"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @toggle-artifact="artifactOpen = !artifactOpen"
        @rename="
          current &&
          openDialog('rename', {
            id: current.id,
            title: current.title,
            createdAt: current.createdAt,
            updatedAt: current.updatedAt,
            messageCount: current.messageCount,
          })
        "
        @minimize="desktopApi.window.minimize"
        @maximize="desktopApi.window.toggleMaximize"
        @close="desktopApi.window.close"
      />

      <div class="workspace-body">
        <section class="chat-pane">
          <div ref="scroller" class="message-scroller">
            <div v-if="current" class="message-stream">
              <EmptyState
                v-if="current.messages.length === 0 && !running"
                @use-prompt="send"
              />
              <ChatMessageView
                v-for="message in current.messages"
                :key="message.id"
                :message="message"
              />
              <article
                v-if="toolRuns.length || streamingText"
                class="chat-message role-assistant live-response"
              >
                <ToolActivity :runs="toolRuns" />
                <MarkdownContent
                  v-if="streamingText"
                  :content="streamingText"
                />
                <span v-if="running" class="stream-caret" aria-hidden="true" />
              </article>
              <p v-if="runError" class="run-error">{{ runError }}</p>
              <ApprovalCard
                v-if="pendingApproval"
                :request="pendingApproval"
                :busy="approvalBusy"
                @decide="resolveApproval"
              />
            </div>
          </div>
          <Composer
            :disabled="!current"
            :running="running"
            @send="send"
            @cancel="desktopApi.agent.cancel"
          />
        </section>

        <ArtifactPanel v-if="artifactOpen" @close="artifactOpen = false" />
      </div>
    </main>

    <ConversationDialog
      v-if="dialog"
      :mode="dialog.mode"
      :title="dialog.conversation.title"
      @close="dialog = undefined"
      @confirm="confirmDialog"
    />
  </div>
</template>

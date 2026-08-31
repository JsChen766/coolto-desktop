<script setup lang="ts">
import { CalendarClock, Check, LoaderCircle, Mail, Unplug } from "@lucide/vue";
import { onMounted, ref } from "vue";

import type { DesktopApi, MailConnectionView, MailProviderView } from "@desktop/types";
import MailScheduleLoopDialog from "../agent-tasks/MailScheduleLoopDialog.vue";

const props = defineProps<{ api: DesktopApi; conversationId: string }>();
const emit = defineEmits<{ started: [taskId: string] }>();
const providers = ref<MailProviderView[]>([]);
const connections = ref<MailConnectionView[]>([]);
const busy = ref<string>();
const confirmingDisconnect = ref<string>();
const error = ref<string>();
const scheduleOpen = ref(false);

onMounted(load);

async function load(): Promise<void> {
  error.value = undefined;
  try {
    [providers.value, connections.value] = await Promise.all([
      props.api.mailConnections.providers(), props.api.mailConnections.list(),
    ]);
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  }
}

async function connect(provider: MailProviderView["provider"]): Promise<void> {
  busy.value = provider;
  error.value = undefined;
  try {
    await props.api.mailConnections.connect(provider);
    await load();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally { busy.value = undefined; }
}

async function disconnect(connectionId: string): Promise<void> {
  if (confirmingDisconnect.value !== connectionId) {
    confirmingDisconnect.value = connectionId;
    return;
  }
  busy.value = connectionId;
  error.value = undefined;
  try {
    await props.api.mailConnections.disconnect(connectionId);
    confirmingDisconnect.value = undefined;
    await load();
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason);
  } finally { busy.value = undefined; }
}

function label(provider: MailProviderView["provider"]): string {
  return provider === "gmail" ? "Gmail" : "Outlook";
}
</script>

<template>
  <section class="settings-section">
    <div class="settings-section-title icon-label">
      <Mail :size="15" :stroke-width="1.8" aria-hidden="true" />
      <h3>{{ $t('Browser Agent / 可选邮箱直连') }}</h3>
    </div>
    <p class="settings-section-desc">
      {{ $t('默认可通过已授权的浏览器 Webmail 识别邮件；这里的 API 直连仅用于更稳定的增量同步。只申请读取权限，不申请发送权限。App 关闭后不会同步。') }}
    </p>
    <div v-if="connections.length" class="mail-connection-list">
      <div v-for="connection in connections" :key="connection.id" class="mail-connection-row">
        <span><Check :size="14" aria-hidden="true" />
          <strong>{{ label(connection.provider) }}</strong> · {{ connection.accountEmail }}</span>
        <button class="secondary-button" type="button" :disabled="Boolean(busy)" @click="disconnect(connection.id)">
          <LoaderCircle v-if="busy === connection.id" class="spin" :size="14" aria-hidden="true" />
          <Unplug v-else :size="14" aria-hidden="true" />
          {{ $t(confirmingDisconnect === connection.id ? '再次确认断开' : '断开') }}
        </button>
      </div>
    </div>
    <div class="settings-section-actions">
      <button v-for="provider in providers" :key="provider.provider" class="secondary-button" type="button"
        :disabled="Boolean(busy) || !provider.configured" @click="connect(provider.provider)">
        <LoaderCircle v-if="busy === provider.provider" class="spin" :size="14" aria-hidden="true" />
        {{ provider.configured ? $t(`连接 ${label(provider.provider)}`) : $t(`${label(provider.provider)} 尚未配置`) }}
      </button>
      <button class="secondary-button" type="button" @click="scheduleOpen = true">
        <CalendarClock :size="14" aria-hidden="true" />{{ $t('联动 App 日程') }}
      </button>
    </div>
    <p class="settings-section-desc">{{ $t('Gmail 使用 gmail.readonly；Outlook 使用 Mail.Read。发送权限始终为关闭。') }}</p>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <MailScheduleLoopDialog v-if="scheduleOpen" :api="api"
      :conversation-id="conversationId" :connections="connections"
      @close="scheduleOpen = false" @started="scheduleOpen = false; emit('started', $event)" />
  </section>
</template>

<style scoped>
.mail-connection-list { display: grid; gap: 8px; margin: 10px 0; }
.mail-connection-row { display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 9px 10px; border: 1px solid var(--border); border-radius: 9px; }
.mail-connection-row > span { display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 560px) { .mail-connection-row { align-items: stretch; flex-direction: column; } }
</style>

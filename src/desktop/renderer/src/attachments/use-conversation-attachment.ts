import { onBeforeUnmount, ref, watch } from "vue";

import type { DesktopAgentEvent } from "@desktop/types";
import {
  AttachmentEventTracker,
  type AttachmentView,
} from "./attachment-event-tracker";
import { desktopApi } from "../lib/desktop-api";

export type { AttachmentView } from "./attachment-event-tracker";

export function useConversationAttachment(
  conversationId: () => string | undefined,
) {
  const attachment = ref<AttachmentView>();
  const selecting = ref(false);
  const error = ref<string>();
  const tracker = new AttachmentEventTracker();

  const unsubscribe = desktopApi.agent.onEvent(handleAgentEvent);
  onBeforeUnmount(unsubscribe);
  watch(conversationId, (id) => void load(id), { immediate: true });

  async function load(id: string | undefined): Promise<void> {
    error.value = undefined;
    if (!id) {
      attachment.value = undefined;
      tracker.clear();
      return;
    }
    try {
      const selected = (await desktopApi.attachments.list(id))[0];
      if (conversationId() === id) {
        attachment.value = tracker.sync(id, selected);
      }
    } catch (cause: unknown) {
      if (conversationId() === id) error.value = errorMessage(cause);
    }
  }

  async function select(): Promise<void> {
    const id = conversationId();
    if (!id || selecting.value) return;
    selecting.value = true;
    error.value = undefined;
    try {
      const selected = await desktopApi.attachments.select(id);
      if (selected && conversationId() === id) {
        attachment.value = tracker.sync(id, selected);
      }
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    } finally {
      selecting.value = false;
    }
  }

  async function remove(): Promise<void> {
    const id = conversationId();
    const selected = attachment.value;
    if (!id || !selected) return;
    error.value = undefined;
    try {
      await desktopApi.attachments.remove({
        conversationId: id,
        fileId: selected.id,
      });
      tracker.remove(id);
      attachment.value = undefined;
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    }
  }

  function handleAgentEvent(
    eventConversationId: string,
    event: DesktopAgentEvent,
  ): void {
    const updated = tracker.handle(eventConversationId, event);
    if (conversationId() === eventConversationId) attachment.value = updated;
  }

  return { attachment, selecting, error, select, remove };
}

function errorMessage(value: unknown): string {
  return (value instanceof Error ? value.message : String(value))
    .replace(/^Error invoking remote method '[^']+':\s*/u, "")
    .replace(/^Error:\s*/u, "");
}

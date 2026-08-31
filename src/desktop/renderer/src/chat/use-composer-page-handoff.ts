import { nextTick, onBeforeUnmount, onMounted, type Ref } from "vue";

import { subscribeBrowserPageHandoff } from
  "../browser/browser-page-handoff-channel";
import { translateFormat } from "../i18n/locale";

export function useComposerPageHandoff(
  text: Ref<string>,
  textarea: Readonly<Ref<HTMLTextAreaElement | null>>,
  resize: () => void,
): void {
  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    unsubscribe = subscribeBrowserPageHandoff((request) => {
      if (text.value.includes(request.page.url)) return;
      const context = translateFormat("请使用这个页面作为上下文：{title}\n{url}", {
        title: request.page.title,
        url: request.page.url,
      });
      text.value = text.value.trim() ? `${text.value.trim()}\n\n${context}` : context;
      void nextTick(() => { resize(); textarea.value?.focus(); });
    });
  });
  onBeforeUnmount(() => unsubscribe?.());
}

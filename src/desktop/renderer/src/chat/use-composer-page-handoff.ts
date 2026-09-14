import { onBeforeUnmount, onMounted } from "vue";

import { buildAnalyzeJdPageInstruction } from
  "../../../../job-assets/job-action-instruction.js";
import { subscribeBrowserPageHandoff } from
  "../browser/browser-page-handoff-channel";
import { translateFormat } from "../i18n/locale";

export function useComposerPageHandoff(input: {
  draft(text: string): void;
  analyze(text: string): void;
  blocked(): boolean;
}): void {
  let lastSequence = 0;
  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    unsubscribe = subscribeBrowserPageHandoff((request) => {
      if (request.sequence === lastSequence) return;
      lastSequence = request.sequence;
      if (input.blocked()) return;
      if (request.page.intent === "analyze_jd") {
        input.analyze(buildAnalyzeJdPageInstruction(
          request.page.title,
          request.page.url,
        ));
        return;
      }
      input.draft(translateFormat("请使用这个页面作为上下文：{title}\n{url}", {
        title: request.page.title,
        url: request.page.url,
      }));
    });
  });
  onBeforeUnmount(() => unsubscribe?.());
}

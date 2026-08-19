import { onBeforeUnmount, onMounted, watch } from "vue";

import { desktopApi } from "../lib/desktop-api";
import type { useResumeWorkspace } from "../resume-workspace/use-resume-workspace";

export function useWindowCloseSave(
  workspace: ReturnType<typeof useResumeWorkspace>,
): void {
  let unsubscribe: (() => void) | undefined;
  onMounted(() => {
    unsubscribe = desktopApi.window.onSaveBeforeClose(() => {
      void (async () => {
        const saved = await workspace.flushPendingEdits();
        await desktopApi.window.completeSaveBeforeClose(saved);
      })();
    });
  });
  onBeforeUnmount(() => unsubscribe?.());
  watch(
    workspace.localSaveState,
    (state) => void desktopApi.window.reportDraftSaveState(state).catch(() => undefined),
    { immediate: true },
  );
}

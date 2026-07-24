import { ref } from "vue";

import type {
  ResumeDraftDetail,
  ResumeDraftEditInput,
  ResumeDraftRestoreInput,
} from "@desktop/types";
import type { ResumeDraftSummary } from "../../../../resume/draft/types";
import { desktopApi } from "../lib/desktop-api";

export function useResumeWorkspace() {
  const drafts = ref<ResumeDraftSummary[]>([]);
  const activeDraft = ref<ResumeDraftDetail>();
  const busy = ref(false);
  const error = ref<string>();
  const localSaveState = ref<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  let editQueue = Promise.resolve();

  async function loadDrafts(): Promise<void> {
    drafts.value = await desktopApi.resumeDrafts.list();
  }

  async function openDraft(artifactId: string): Promise<void> {
    busy.value = true;
    error.value = undefined;
    try {
      activeDraft.value = await desktopApi.resumeDrafts.get(artifactId);
      localSaveState.value = "saved";
      await loadDrafts();
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }

  async function refreshActive(): Promise<void> {
    if (activeDraft.value) {
      await openDraft(activeDraft.value.artifactId);
    } else {
      await loadDrafts();
    }
  }

  async function edit(input: ResumeDraftEditInput): Promise<void> {
    await enqueueEdit(input, true);
  }

  async function autosave(input: ResumeDraftEditInput): Promise<void> {
    await enqueueEdit({ ...input, createCheckpoint: false }, false);
  }

  async function enqueueEdit(
    input: ResumeDraftEditInput,
    refreshView: boolean,
  ): Promise<void> {
    editQueue = editQueue.then(async () => {
      localSaveState.value = "saving";
      error.value = undefined;
      try {
        const saved = await desktopApi.resumeDrafts.edit(input);
        if (refreshView) {
          activeDraft.value = saved;
          await loadDrafts();
        }
        localSaveState.value = "saved";
      } catch (cause: unknown) {
        error.value = errorMessage(cause);
        localSaveState.value = "error";
      }
    });
    await editQueue;
  }

  async function restore(input: ResumeDraftRestoreInput): Promise<void> {
    busy.value = true;
    error.value = undefined;
    try {
      activeDraft.value = await desktopApi.resumeDrafts.restore(input);
      localSaveState.value = "saved";
      await loadDrafts();
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }

  async function resolvePending(decision: "accept" | "reject"): Promise<void> {
    const draft = activeDraft.value;
    if (!draft) return;
    busy.value = true;
    error.value = undefined;
    try {
      activeDraft.value = await desktopApi.resumeDrafts[decision](
        draft.artifactId,
      );
      localSaveState.value = "saved";
      await loadDrafts();
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }

  function clear(): void {
    drafts.value = [];
    activeDraft.value = undefined;
    error.value = undefined;
    localSaveState.value = "idle";
  }

  return {
    drafts,
    activeDraft,
    busy,
    error,
    localSaveState,
    loadDrafts,
    openDraft,
    refreshActive,
    edit,
    autosave,
    restore,
    resolvePending,
    clear,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

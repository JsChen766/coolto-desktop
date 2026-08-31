import { ref } from "vue";
import type { ResumeDraftDetail, ResumeDraftEditInput, ResumeDraftRestoreInput } from "@desktop/types";
import type { ResumeDraftSummary } from "../../../../resume/draft/types";
import { desktopApi } from "../lib/desktop-api";
import { translate, translateFormat } from "../i18n/locale";
import { desktopErrorMessage } from "../chat/desktop-error-message";
import { useResumeLineSpacing } from "./use-resume-line-spacing";
export function useResumeWorkspace() {
  const drafts = ref<ResumeDraftSummary[]>([]);
  const activeDraft = ref<ResumeDraftDetail>();
  const busy = ref(false);
  const error = ref<string>();
  const exporting = ref(false);
  const exportMessage = ref("");
  const savingToLibrary = ref(false);
  const saveMessage = ref("");
  const localSaveState = ref<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle",
  );
  let editQueue = Promise.resolve();
  const pendingEdits = new Map<string, ResumeDraftEditInput>();
  const autosaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const editFailures = new Map<string, string>();
  let exportMessageTimer: ReturnType<typeof setTimeout> | undefined;
  let saveMessageTimer: ReturnType<typeof setTimeout> | undefined;
  const lineSpacing = useResumeLineSpacing({
    activeDraft,
    error,
    localSaveState,
    flushTextEdits: flushPendingEdits,
    reloadDrafts: loadDrafts,
  });
  async function loadDrafts(): Promise<void> {
    drafts.value = await desktopApi.resumeDrafts.list();
  }
  async function openDraft(artifactId: string): Promise<void> {
    await lineSpacing.flush();
    if (pendingEdits.size && !await flushPendingEdits()) return;
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
    const key = editKey(input);
    clearEditTimer(key);
    pendingEdits.delete(key);
    await enqueueEdit({ ...input, createCheckpoint: true }, true);
  }
  function autosave(input: ResumeDraftEditInput): void {
    const key = editKey(input);
    pendingEdits.set(key, { ...input, createCheckpoint: false });
    clearEditTimer(key);
    localSaveState.value = "dirty";
    autosaveTimers.set(key, setTimeout(() => {
      autosaveTimers.delete(key);
      const pending = pendingEdits.get(key);
      pendingEdits.delete(key);
      if (pending) void enqueueEdit(pending, false);
    }, 900));
  }
  function clearEditTimer(key: string): void {
    const timer = autosaveTimers.get(key);
    if (timer) clearTimeout(timer);
    autosaveTimers.delete(key);
  }
  async function flushPendingEdits(): Promise<boolean> {
    const pending = [...pendingEdits.values()];
    pendingEdits.clear();
    autosaveTimers.forEach(clearTimeout);
    autosaveTimers.clear();
    for (const input of pending) {
      await enqueueEdit({ ...input, createCheckpoint: true }, true);
    }
    await editQueue;
    return localSaveState.value !== "error" && editFailures.size === 0;
  }
  async function enqueueEdit(
    input: ResumeDraftEditInput,
    refreshView: boolean,
  ): Promise<void> {
    const key = editKey(input);
    editQueue = editQueue.then(async () => {
      localSaveState.value = "saving";
      error.value = undefined;
      try {
        const saved = await desktopApi.resumeDrafts.edit(input);
        editFailures.delete(key);
        if (refreshView) {
          activeDraft.value = saved;
          await loadDrafts();
        }
        localSaveState.value = editFailures.size ? "error" : "saved";
      } catch (cause: unknown) {
        error.value = errorMessage(cause);
        editFailures.set(key, error.value);
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
      activeDraft.value = await desktopApi.resumeDrafts[decision](draft.artifactId);
      localSaveState.value = "saved";
      await loadDrafts();
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    } finally {
      busy.value = false;
    }
  }
  async function exportActiveDraft(): Promise<void> {
    await lineSpacing.flush();
    if (!await flushPendingEdits()) return;
    const draft = activeDraft.value;
    if (!draft || exporting.value) return;
    exporting.value = true;
    error.value = undefined;
    exportMessage.value = "";
    try {
      const result = await desktopApi.resumeDrafts.exportPdf({
        artifactId: draft.artifactId,
        expectedRevision: draft.revision,
      });
      if (result.status === "exported") {
        exportMessage.value = translateFormat("已导出到 {file}", { file: result.filename });
        if (exportMessageTimer) clearTimeout(exportMessageTimer);
        exportMessageTimer = setTimeout(() => { exportMessage.value = ""; }, 4000);
      }
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    } finally {
      exporting.value = false;
    }
  }

  async function saveActiveDraft(): Promise<void> {
    await lineSpacing.flush();
    if (!await flushPendingEdits()) return;
    const draft = activeDraft.value;
    if (!draft || savingToLibrary.value) return;
    savingToLibrary.value = true;
    error.value = undefined;
    saveMessage.value = "";
    try {
      activeDraft.value = await desktopApi.resumeDrafts.save({
        artifactId: draft.artifactId,
        expectedRevision: draft.revision,
      });
      await loadDrafts();
      saveMessage.value = translate("已保存到简历库");
      if (saveMessageTimer) clearTimeout(saveMessageTimer);
      saveMessageTimer = setTimeout(() => { saveMessage.value = ""; }, 4000);
    } catch (cause: unknown) {
      error.value = errorMessage(cause);
    } finally {
      savingToLibrary.value = false;
    }
  }

  function clear(): void {
    lineSpacing.clear();
    pendingEdits.clear();
    autosaveTimers.forEach(clearTimeout);
    autosaveTimers.clear();
    editFailures.clear();
    drafts.value = [];
    activeDraft.value = undefined;
    error.value = undefined;
    exporting.value = false;
    exportMessage.value = "";
    savingToLibrary.value = false;
    saveMessage.value = "";
    localSaveState.value = "idle";
  }
  function markLocalSaveFailed(message: string): void {
    error.value = message; localSaveState.value = "error";
  }
  function markLocalSaving(replacePreview = false): void {
    if (replacePreview) activeDraft.value = undefined;
    error.value = undefined;
    localSaveState.value = "saving";
  }
  return {
    drafts,
    activeDraft,
    busy,
    error,
    exporting,
    exportMessage,
    savingToLibrary,
    saveMessage,
    lineSpacing,
    localSaveState,
    loadDrafts,
    openDraft,
    refreshActive,
    edit,
    autosave,
    flushPendingEdits,
    restore,
    resolvePending,
    exportActiveDraft,
    saveActiveDraft,
    clear,
    markLocalSaveFailed,
    markLocalSaving,
  };
}
function editKey(input: ResumeDraftEditInput): string {
  const targetId = input.target.type === "bullet"
    ? input.target.bulletId
    : input.target.itemId;
  return `${input.artifactId}:${input.target.type}:${targetId}`;
}
function errorMessage(error: unknown): string {
  return desktopErrorMessage(error);
}

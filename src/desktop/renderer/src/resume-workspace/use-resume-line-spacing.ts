import { ref, watch, type Ref } from "vue";

import type { ResumeDraftDetail } from "@desktop/types";
import {
  RESUME_LINE_SPACING_MAX_PERCENT,
  clampResumeLineSpacingPercent,
  resumeLineSpacingPercent,
} from "../../../../resume/layout-line-spacing";
import { desktopApi } from "../lib/desktop-api";

type LocalSaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function useResumeLineSpacing(input: {
  activeDraft: Ref<ResumeDraftDetail | undefined>;
  error: Ref<string | undefined>;
  localSaveState: Ref<LocalSaveState>;
  flushTextEdits: () => Promise<boolean>;
  reloadDrafts: () => Promise<void>;
}) {
  const percent = ref(100);
  const maximumPercent = ref(RESUME_LINE_SPACING_MAX_PERCENT);
  const saving = ref(false);
  let commitQueue = Promise.resolve();
  let activeArtifactId: string | undefined;

  watch(
    input.activeDraft,
    (draft) => {
      percent.value = draft ? resumeLineSpacingPercent(draft.structure) : 100;
      if (draft?.artifactId !== activeArtifactId) {
        maximumPercent.value = RESUME_LINE_SPACING_MAX_PERCENT;
        activeArtifactId = draft?.artifactId;
      }
    },
    { immediate: true },
  );

  function preview(value: number): void {
    percent.value = Math.min(
      maximumPercent.value,
      clampResumeLineSpacingPercent(value),
    );
  }

  function updateMaximum(value: number): void {
    const measured = clampResumeLineSpacingPercent(value);
    const persisted = input.activeDraft.value
      ? resumeLineSpacingPercent(input.activeDraft.value.structure)
      : measured;
    maximumPercent.value = Math.max(measured, persisted);
    if (percent.value > maximumPercent.value) {
      percent.value = maximumPercent.value;
    }
  }

  function commit(value: number): Promise<void> {
    const target = Math.min(
      maximumPercent.value,
      clampResumeLineSpacingPercent(value),
    );
    percent.value = target;
    commitQueue = commitQueue.then(async () => {
      if (!await input.flushTextEdits()) {
        restorePersistedPercent();
        return;
      }
      const draft = input.activeDraft.value;
      if (!draft || resumeLineSpacingPercent(draft.structure) === target) return;
      saving.value = true;
      input.localSaveState.value = "saving";
      input.error.value = undefined;
      try {
        input.activeDraft.value = await desktopApi.resumeDrafts.setLineSpacing({
          artifactId: draft.artifactId,
          expectedRevision: draft.revision,
          scalePercent: target,
        });
        input.localSaveState.value = "saved";
        await input.reloadDrafts();
      } catch (cause: unknown) {
        restorePersistedPercent();
        input.error.value = errorMessage(cause);
        input.localSaveState.value = "error";
      } finally {
        saving.value = false;
      }
    });
    return commitQueue;
  }

  async function flush(): Promise<void> {
    await commitQueue;
  }

  function clear(): void {
    percent.value = 100;
    maximumPercent.value = RESUME_LINE_SPACING_MAX_PERCENT;
    activeArtifactId = undefined;
  }

  function restorePersistedPercent(): void {
    const draft = input.activeDraft.value;
    percent.value = draft ? resumeLineSpacingPercent(draft.structure) : 100;
  }

  return { percent, maximumPercent, saving, preview, updateMaximum, commit, flush, clear };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

import { ref } from "vue";
import type { ResumeLibraryEntry, ResumeDraftCheckpoint } from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";

export function useResumeLibrary() {
  const entries = ref<ResumeLibraryEntry[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const checkpoints = ref<ResumeDraftCheckpoint[]>([]);
  const checkpointDraftId = ref<string | null>(null);

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      entries.value = await desktopApi.library.list();
    } catch (e) {
      error.value = e instanceof Error ? e.message : "加载简历仓库失败";
    } finally {
      loading.value = false;
    }
  }

  async function rename(resumeId: string, title: string) {
    await desktopApi.library.rename({ resumeId, title });
    await load();
  }

  async function archive(resumeId: string, isArchive: boolean) {
    await desktopApi.library.archive({ resumeId, archive: isArchive });
    await load();
  }

  async function deleteDraft(artifactId: string) {
    await desktopApi.library.deleteDraft({ artifactId });
    await load();
  }

  async function loadCheckpoints(artifactId: string) {
    checkpointDraftId.value = artifactId;
    checkpoints.value = await desktopApi.library.getCheckpoints(artifactId);
  }

  function clearCheckpoints() {
    checkpoints.value = [];
    checkpointDraftId.value = null;
  }

  async function restoreCheckpoint(artifactId: string, checkpointId: string) {
    await desktopApi.library.restoreCheckpoint({ artifactId, checkpointId });
    clearCheckpoints();
    await load();
  }

  return {
    entries,
    loading,
    error,
    checkpoints,
    checkpointDraftId,
    load,
    rename,
    archive,
    deleteDraft,
    loadCheckpoints,
    clearCheckpoints,
    restoreCheckpoint,
  };
}

import { ref, type Ref } from "vue";

import type {
  CloudResumePreview,
  ResumeChatReference,
  ResumeDraftDetail,
  ResumeLibraryEntry,
} from "@desktop/types";
import { desktopApi } from "../lib/desktop-api";

type PreviewSource = "local" | "cloud";

interface ResumeLibraryPreviewOptions {
  activeView: Ref<"chat" | "experiences" | "library" | "tracker">;
  activeArtifactType: Ref<"resume" | "jd" | "match">;
  artifactOpen: Ref<boolean>;
  closeNarrowSidebar(): void;
  openLocalDraft(artifactId: string): Promise<void>;
  draftIds(): string[];
  sendInstruction(text: string, reference: ResumeChatReference): Promise<void>;
}

export function useResumeLibraryPreview(options: ResumeLibraryPreviewOptions) {
  const cloudResumePreview = ref<CloudResumePreview>();
  const cloudResumePreviewBusy = ref(false);
  const cloudResumePreviewError = ref<string>();
  const repositoryResumePreview = ref(false);
  const resumePreviewChoice = ref<ResumeLibraryEntry>();
  const resumeOperationContext = ref<ResumeChatReference>();
  const cloudCopyConfirmation = ref(false);
  const cloudCopyRequested = ref(false);
  let copyBaselineIds = new Set<string>();

  function requestResumePreview(entry: ResumeLibraryEntry): void {
    if (entry.syncStatus === "conflict" && entry.local && entry.cloud) {
      resumePreviewChoice.value = entry;
      return;
    }
    void openResumePreview(entry, entry.local ? "local" : "cloud");
  }

  function chooseResumePreview(source: PreviewSource): void {
    const entry = resumePreviewChoice.value;
    resumePreviewChoice.value = undefined;
    if (entry) void openResumePreview(entry, source);
  }

  async function openResumePreview(
    entry: ResumeLibraryEntry,
    source: PreviewSource,
  ): Promise<void> {
    const artifactId = entry.local?.artifactId;
    const resumeId = entry.cloud?.resumeId;
    if (source === "local" && !artifactId) return;
    if (source === "cloud" && !resumeId) return;
    options.closeNarrowSidebar();
    options.activeView.value = "chat";
    options.activeArtifactType.value = "resume";
    options.artifactOpen.value = true;
    repositoryResumePreview.value = true;
    cloudResumePreview.value = undefined;
    cloudResumePreviewError.value = undefined;
    if (source === "local" && artifactId) {
      resumeOperationContext.value = localReference(entry, artifactId);
      await options.openLocalDraft(artifactId);
      return;
    }
    cloudResumePreviewBusy.value = true;
    try {
      const preview = await desktopApi.library.preview(resumeId!);
      cloudResumePreview.value = preview;
      resumeOperationContext.value = cloudReference(entry, preview);
    } catch (error) {
      cloudResumePreviewError.value =
        error instanceof Error ? error.message : "读取云端简历失败";
    } finally {
      cloudResumePreviewBusy.value = false;
    }
  }

  function requestCloudResumeCopy(): void {
    if (resumeOperationContext.value?.source === "cloud") {
      cloudCopyConfirmation.value = true;
    }
  }

  async function confirmCloudResumeCopy(): Promise<void> {
    const reference = resumeOperationContext.value;
    if (reference?.source !== "cloud") return;
    cloudCopyConfirmation.value = false;
    cloudCopyRequested.value = true;
    copyBaselineIds = new Set(options.draftIds());
    const copyReference: ResumeChatReference = {
      ...reference,
      operationMode: "create_local_copy",
    };
    resumeOperationContext.value = copyReference;
    await options.sendInstruction(
      `请为云端简历“${reference.label}”创建本地可编辑工作副本。`,
      copyReference,
    );
  }

  function adoptCreatedLocalDraft(draft: ResumeDraftDetail): void {
    if (!cloudCopyRequested.value || copyBaselineIds.has(draft.artifactId)) {
      return;
    }
    resumeOperationContext.value = {
      artifactId: draft.artifactId,
      targetType: "resume",
      targetId: draft.artifactId,
      label: draft.title,
      source: "local",
    };
    cloudResumePreview.value = undefined;
    cloudCopyRequested.value = false;
    copyBaselineIds.clear();
  }

  function clearResumeOperationContext(): void {
    resumeOperationContext.value = undefined;
    cloudCopyRequested.value = false;
    cloudCopyConfirmation.value = false;
    copyBaselineIds.clear();
  }

  function returnToJobRepository(): void {
    options.activeView.value = "library";
    options.artifactOpen.value = false;
    resetResumePreview();
  }

  function resetResumePreview(): void {
    cloudResumePreview.value = undefined;
    cloudResumePreviewError.value = undefined;
    cloudResumePreviewBusy.value = false;
    repositoryResumePreview.value = false;
    resumePreviewChoice.value = undefined;
    clearResumeOperationContext();
  }

  return {
    adoptCreatedLocalDraft,
    chooseResumePreview,
    clearResumeOperationContext,
    cloudCopyConfirmation,
    cloudCopyRequested,
    cloudResumePreview,
    cloudResumePreviewBusy,
    cloudResumePreviewError,
    confirmCloudResumeCopy,
    repositoryResumePreview,
    requestCloudResumeCopy,
    requestResumePreview,
    resetResumePreview,
    resumeOperationContext,
    resumePreviewChoice,
    returnToJobRepository,
  };
}

function localReference(
  entry: ResumeLibraryEntry,
  artifactId: string,
): ResumeChatReference {
  return {
    artifactId,
    targetType: "resume",
    targetId: artifactId,
    label: entry.displayTitle,
    source: "local",
    ...(entry.cloud ? { resumeId: entry.cloud.resumeId } : {}),
  };
}

function cloudReference(
  entry: ResumeLibraryEntry,
  preview: CloudResumePreview,
): ResumeChatReference {
  return {
    artifactId: `cloud:${preview.resumeId}`,
    targetType: "resume",
    targetId: preview.resumeId,
    label: entry.displayTitle,
    source: "cloud",
    resumeId: preview.resumeId,
    contentHash: preview.contentHash,
    operationMode: "read_only",
  };
}

import type { ResumeFull } from "../types.js";
import type { LocalResumeDraft, ResumeDraftSummary } from "../draft/types.js";
import type {
  ResumeLibraryEntry,
  ResumeLibraryCloudSummary,
  ResumeLibraryLocalSummary,
  ResumeLibraryOperation,
  ResumeLibrarySyncStatus,
} from "./types.js";
import { computeSyncStatus } from "./sync-status.js";
import { resumeDraftSummaryState } from "../draft/summary-state.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildLibraryEntries(
  clouds: ResumeFull[],
  drafts: ResumeDraftSummary[],
): ResumeLibraryEntry[] {
  const entries: ResumeLibraryEntry[] = [];
  const consumedDraftIds = new Set<string>();

  // Cloud resumes — try to find a linked local draft
  for (const cloud of clouds) {
    const linkedDraft = findDraftLinkedTo(cloud.id, drafts);

    const cloudSummary = toCloudSummary(cloud);
    const localSummary = linkedDraft ? toLocalSummary(linkedDraft) : null;

    const syncStatus = computeSyncStatus({
      hasCloud: true,
      hasDraft: linkedDraft != null,
      cloudLink: null, // ResumeDraftSummary doesn't expose cloudLink directly
      cloudContentHash: cloud.contentHash,
      localRevision: null,
    });

    // Use the summary's cloudState as a simpler proxy when cloudLink detail is unavailable
    const effectiveSync = linkedDraft
      ? cloudStateToSyncStatus(linkedDraft.cloudState)
      : "cloud_only";

    if (linkedDraft) consumedDraftIds.add(linkedDraft.artifactId);

    entries.push({
      entryId: `cloud:${cloud.id}`,
      displayTitle: cloudSummary.title,
      cloud: cloudSummary,
      local: localSummary,
      syncStatus: effectiveSync,
      availableOperations: buildOperations(effectiveSync, cloud.status, linkedDraft != null),
    });
  }

  // Local-only drafts (no cloudLink or cloudLink points to non-existent resume)
  for (const draft of drafts) {
    if (consumedDraftIds.has(draft.artifactId)) continue;
    const localSummary = toLocalSummary(draft);
    entries.push({
      entryId: `local:${draft.artifactId}`,
      displayTitle: localSummary.title,
      cloud: null,
      local: localSummary,
      syncStatus: "local_only",
      availableOperations: buildOperations("local_only", "draft", true),
    });
  }

  return entries;
}

/**
 * Rebuild a single entry with full cloudLink detail — used after library:list
 * returns full drafts so sync-status can be computed precisely.
 */
export function buildEntryFromFull(
  cloud: ResumeFull | null,
  draft: LocalResumeDraft | null,
): ResumeLibraryEntry {
  const cloudSummary = cloud ? toCloudSummary(cloud) : null;
  const localSummary = draft ? toLocalSummaryFromFull(draft) : null;

  const syncStatus = computeSyncStatus({
    hasCloud: cloud != null,
    hasDraft: draft != null,
    cloudLink: draft?.cloudLink ?? null,
    cloudContentHash: cloud?.contentHash ?? null,
    localRevision: draft?.workspace.revision ?? null,
  });

  const effectiveStatus = cloud?.status ?? "draft";
  const id = cloud ? `cloud:${cloud.id}` : `local:${draft!.artifactId}`;
  const title = cloudSummary?.title ?? localSummary?.title ?? "未命名简历";

  return {
    entryId: id,
    displayTitle: title,
    cloud: cloudSummary,
    local: localSummary,
    syncStatus,
    availableOperations: buildOperations(syncStatus, effectiveStatus, draft != null),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findDraftLinkedTo(
  resumeId: string,
  drafts: ResumeDraftSummary[],
): ResumeDraftSummary | undefined {
  return drafts.find((draft) => draft.cloudResumeId === resumeId);
}

function cloudStateToSyncStatus(
  cloudState: ResumeDraftSummary["cloudState"],
): ResumeLibrarySyncStatus {
  switch (cloudState) {
    case "synced": return "synced";
    case "local_changes": return "local_changes";
    case "local_only": return "local_only";
  }
}

function toCloudSummary(cloud: ResumeFull): ResumeLibraryCloudSummary {
  return {
    resumeId: cloud.id,
    title: cloud.title,
    targetRole: cloud.targetRole,
    jdId: cloud.jdId,
    status: cloud.status,
    contentHash: cloud.contentHash,
    updatedAt: cloud.updatedAt,
  };
}

function toLocalSummary(draft: ResumeDraftSummary): ResumeLibraryLocalSummary {
  return {
    artifactId: draft.artifactId,
    title: draft.title,
    updatedAt: draft.updatedAt,
    checkpointCount: draft.checkpointCount,
    hasPendingChange: draft.hasPendingChange,
    workspaceStatus: draft.workspaceStatus,
    generationReady: draft.generationReady,
    jdId: draft.jdId,
    jdTitle: draft.jdTitle,
  };
}

function toLocalSummaryFromFull(draft: LocalResumeDraft): ResumeLibraryLocalSummary {
  const state = resumeDraftSummaryState(draft.workspace);
  return {
    artifactId: draft.artifactId,
    title: draft.title,
    updatedAt: draft.updatedAt,
    checkpointCount: draft.checkpoints.length,
    hasPendingChange: draft.pendingChange != null,
    ...state,
  };
}

function buildOperations(
  syncStatus: ResumeLibrarySyncStatus,
  cloudStatus: string,
  hasDraft: boolean,
): ResumeLibraryOperation[] {
  const ops: ResumeLibraryOperation[] = ["open"];

  if (syncStatus !== "local_only") {
    ops.push("rename");
    if (cloudStatus === "archived") {
      ops.push("unarchive");
    } else {
      ops.push("archive");
    }
    ops.push("continue_editing");
    ops.push("export_pdf");
  }

  if (syncStatus === "cloud_changes") ops.push("reload_cloud");
  if (syncStatus === "conflict") {
    ops.push("reload_cloud");
    ops.push("save_as_new");
    ops.push("overwrite_cloud");
  }

  if (hasDraft) {
    ops.push("delete_local_draft");
    ops.push("restore_checkpoint");
  }

  return ops;
}

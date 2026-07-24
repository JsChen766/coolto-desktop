import type { ResumeDraftCloudLink } from "../draft/types.js";
import type { ResumeLibrarySyncStatus } from "./types.js";

export interface SyncStatusInput {
  hasCloud: boolean;
  hasDraft: boolean;
  cloudLink: ResumeDraftCloudLink | null;
  cloudContentHash: string | null;
  localRevision: number | null;
}

/**
 * Pure function — computes the sync relationship between a cloud resume and
 * a local draft without any I/O or side-effects.
 *
 * Conflict = both sides changed since last sync:
 *   - cloud changed:  cloudLink.contentHash !== cloud.contentHash
 *   - local changed:  workspace.revision    !== cloudLink.syncedRevision
 */
export function computeSyncStatus(input: SyncStatusInput): ResumeLibrarySyncStatus {
  const { hasCloud, hasDraft, cloudLink, cloudContentHash, localRevision } = input;

  if (hasCloud && !hasDraft) return "cloud_only";
  if (!hasCloud && hasDraft) return "local_only";

  // Both sides present — determine relationship via cloudLink
  if (!cloudLink) {
    // Draft exists but has never been linked to any cloud resume
    return "local_only";
  }

  const cloudChanged = cloudContentHash !== null && cloudLink.contentHash !== cloudContentHash;
  const localChanged = localRevision !== null && localRevision !== cloudLink.syncedRevision;

  if (cloudChanged && localChanged) return "conflict";
  if (cloudChanged) return "cloud_changes";
  if (localChanged) return "local_changes";
  return "synced";
}

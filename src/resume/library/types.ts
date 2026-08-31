/**
 * ResumeLibraryEntry — read-only projection that unifies a cloud Resume's
 * current content with its local draft association, sync status, and
 * executable operations.
 *
 * This is a view model consumed by the resume library UI. It does NOT define
 * ResumeVersionDiff, cloud version history, or cloud rollback.
 */

import type { ResumeStatus } from "../types.js";
import type { ResumeGenerationStrategy } from "../source-strategy.js";

// ---------------------------------------------------------------------------
// Sync status between local draft and cloud current content.
// ---------------------------------------------------------------------------

export type ResumeLibrarySyncStatus =
  | "cloud_only"
  | "local_only"
  | "synced"
  | "local_changes"
  | "cloud_changes"
  | "conflict";

// ---------------------------------------------------------------------------
// Operations available on a library entry, gated by current state.
// ---------------------------------------------------------------------------

export type ResumeLibraryOperation =
  | "open"
  | "rename"
  | "continue_editing"
  | "archive"
  | "unarchive"
  | "export_pdf"
  | "reload_cloud"
  | "save_as_new"
  | "overwrite_cloud"
  | "delete_local_draft"
  | "restore_checkpoint";

// ---------------------------------------------------------------------------
// Cloud content summary — lightweight fields from the cloud Resume.
// ---------------------------------------------------------------------------

export interface ResumeLibraryCloudSummary {
  resumeId: string;
  title: string;
  targetRole: string | null;
  jdId: string | null;
  status: ResumeStatus;
  contentHash: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Local draft summary — lightweight fields from the local ResumeDraft.
// ---------------------------------------------------------------------------

export interface ResumeLibraryLocalSummary {
  artifactId: string;
  title: string;
  jdId: string | null;
  jdTitle: string | null;
  targetRole: string | null;
  updatedAt: string;
  checkpointCount: number;
  hasPendingChange: boolean;
  generationStrategy: ResumeGenerationStrategy;
  generationReady: boolean;
}

// ---------------------------------------------------------------------------
// ResumeLibraryEntry — one logical record in the resume library.
//
// Exactly one of `cloud` or `local` is always present. When both are
// present, `syncStatus` describes their relationship. When only one side
// exists, `syncStatus` is `cloud_only` or `local_only` respectively.
// ---------------------------------------------------------------------------

export interface ResumeLibraryEntry {
  entryId: string;
  displayTitle: string;
  cloud: ResumeLibraryCloudSummary | null;
  local: ResumeLibraryLocalSummary | null;
  syncStatus: ResumeLibrarySyncStatus;
  availableOperations: ResumeLibraryOperation[];
}

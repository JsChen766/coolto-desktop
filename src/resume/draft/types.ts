import type { ResumeWorkspace } from "../workspace/types.js";

export type ResumeDraftCheckpointReason =
  | "generated"
  | "manual_edit"
  | "ai_change_accepted"
  | "restored";

export interface ResumeDraftCheckpoint {
  id: string;
  label: string;
  reason: ResumeDraftCheckpointReason;
  createdAt: string;
  workspace: ResumeWorkspace;
}

export interface ResumeDraftPendingChange {
  id: string;
  createdAt: string;
  summary: string;
  changedBulletIds: string[];
  base: ResumeWorkspace;
  proposed: ResumeWorkspace;
}

export interface ResumeDraftCloudLink {
  resumeId: string;
  contentHash: string;
  syncedAt: string;
  syncedRevision: number;
}

export interface LocalResumeDraft {
  schemaVersion: "local-resume-draft-v1";
  artifactId: string;
  ownerId: string;
  conversationIds: string[];
  title: string;
  createdAt: string;
  updatedAt: string;
  workspace: ResumeWorkspace;
  checkpoints: ResumeDraftCheckpoint[];
  pendingChange: ResumeDraftPendingChange | null;
  cloudLink: ResumeDraftCloudLink | null;
}

export interface ResumeDraftArtifactReference {
  artifactId: string;
  checkpointId: string | null;
  title: string;
  createdAt: string;
}

export interface ResumeDraftSummary {
  artifactId: string;
  title: string;
  conversationIds: string[];
  updatedAt: string;
  checkpointCount: number;
  hasPendingChange: boolean;
  cloudState: "local_only" | "synced" | "local_changes";
}

export interface ResumeDraftCodec {
  encode(value: string): Uint8Array;
  decode(value: Uint8Array): string;
}

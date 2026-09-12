import type { ResumeCompileResult } from "../../../resume/compiler-types.js";
import type { ResumeDraftSummary } from "../../../resume/draft/types.js";
import type {
  ResumePdfExportResult,
  RevisionDeliveryManifest,
} from "../../../resume/export/types.js";
import type { ResumeStructure } from "../../../resume/types.js";
import type { ResumeWorkspaceStatus } from "../../../resume/workspace/types.js";
import type {
  ResumeGenerationBlocker,
} from "../../../resume/workspace/generation-readiness.js";
import type {
  ApplicationCreateInput,
  ApplicationTransitionInput,
  ApplicationUpdateInput,
} from "../../../tracker/types.js";

export interface ResumeDraftCheckpointView {
  id: string;
  label: string;
  reason: string;
  createdAt: string;
  revision: number;
}

export interface ResumeDraftQualityView {
  pageUsageRatio: number;
  minimumBulletTailRatio: number | null;
  minimumBulletTailTargetRatio: number | null;
  factIntegrity: "passed" | "needs_review" | "failed";
  jdCoverage: { covered: number; total: number; ratio: number } | null;
}

export interface ResumeDraftDetail extends ResumeDraftSummary {
  revision: number;
  structure: ResumeStructure;
  compileResult: ResumeCompileResult;
  workspaceStatus: ResumeWorkspaceStatus;
  quality: ResumeDraftQualityView;
  generationReadiness: {
    ready: boolean;
    blockers: ResumeGenerationBlocker[];
    warnings: ResumeGenerationBlocker[];
  };
  checkpoints: ResumeDraftCheckpointView[];
  pendingChange: {
    id: string;
    summary: string;
    changedBulletIds: string[];
    createdAt: string;
  } | null;
  deliveryManifest?: RevisionDeliveryManifest;
}

export interface ResumeDraftExportPdfInput {
  artifactId: string;
  expectedRevision: number;
  deliveryManifest?: RevisionDeliveryManifest;
}

export interface ResumeDraftSaveInput {
  artifactId: string;
  expectedRevision: number;
  deliveryManifest?: RevisionDeliveryManifest;
}

export type ResumeDraftExportPdfResult = ResumePdfExportResult;

export interface CloudResumePreview {
  resumeId: string;
  title: string;
  contentHash: string;
  updatedAt: string;
  structure: ResumeStructure;
}

export interface ResumeDraftEditInput {
  artifactId: string;
  target:
    | { type: "bullet"; bulletId: string }
    | { type: "raw_text"; itemId: string };
  text: string;
  createCheckpoint?: boolean;
}

export interface ResumeDraftLineSpacingInput {
  artifactId: string;
  expectedRevision: number;
  scalePercent: number;
}

export interface ResumeDraftRestoreInput {
  artifactId: string;
  checkpointId: string;
}

export interface LibraryRenameInput {
  resumeId: string;
  title: string;
}

export interface LibraryArchiveInput {
  resumeId: string;
  archive: boolean;
}

export interface LibraryDeleteDraftInput {
  artifactId: string;
}

export interface LibraryRestoreCheckpointInput {
  artifactId: string;
  checkpointId: string;
}

export interface ApplicationUpdateRequest {
  applicationId: string;
  changes: ApplicationUpdateInput;
}

export interface ApplicationTransitionRequest {
  applicationId: string;
  transition: ApplicationTransitionInput;
}

export interface ApplicationPrepareUpdateRequest {
  applicationId: string;
  changes: ApplicationUpdateInput;
}

export type ApplicationPrepareCreateRequest = ApplicationCreateInput;

import type { ResumeFull, ResumeStructure } from "../types.js";
import type { BulletEvidenceBinding } from "../source-types.js";

export type ResumeSaveMode = "new_resume" | "replace_resume";

export interface ResumeBrowserLayoutObservation {
  run_id: null;
  surface: "review";
  measurement_version: "browser-layout-observation-v1";
  template_id: "resume-standard" | "resume-sparse";
  profile_version: string;
  profile_hash: string;
  fonts_ready: boolean;
  loaded_font_families: string[];
  page_count: number;
  overflow_px: number;
  used_height_px: number;
  available_height_px: number;
  viewport: {
    width_px: number;
    height_px: number;
    device_pixel_ratio: number;
  };
  page_metrics: Array<Record<string, unknown>>;
  bullets: Array<{
    bullet_id: string;
    line_count: number;
    last_line_width_px: number;
    available_line_width_px: number;
  }>;
  client_build: string;
  observed_at: string;
  idempotency_key: string;
}

export interface ResumeSaveApprovalPayload {
  proposalId: string;
  mode: ResumeSaveMode;
  candidateId: string;
  candidateRevision: number;
  title: string;
  targetRole: string | null;
  jdId: string | null;
  resumeId?: string;
  expectedContentHash?: string;
  sourceFingerprint: string;
  structured: ResumeStructure;
  evidenceBindings: BulletEvidenceBinding[];
  observation: ResumeBrowserLayoutObservation;
}

export interface ResumePublicationResult extends ResumeFull {
  created: boolean;
  pageUsageRatio: number;
}

export interface ResumePublicationGateway {
  listResumes(signal?: AbortSignal): Promise<ResumeFull[]>;
  getResume(resumeId: string, signal?: AbortSignal): Promise<ResumeFull>;
  publishNew(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationResult>;
  publishExisting(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationResult>;
}

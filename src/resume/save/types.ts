import type { ResumeFull, ResumeStructure } from "../types.js";
import type { BulletEvidenceBinding } from "../source-types.js";

export type ResumeSaveMode = "new_resume" | "new_variant";

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
  jdId: string;
  resumeId?: string;
  expectedBaseVariantId?: string;
  sourceFingerprint: string;
  structured: ResumeStructure;
  evidenceBindings: BulletEvidenceBinding[];
  observation: ResumeBrowserLayoutObservation;
}

export interface ResumePublicationStageResult {
  resumeId: string;
  variantId: string;
  gateStatus: "unverified" | "passed" | "needs_revision" | "failed";
  publicationStatus: "staged" | "published" | "discarded";
  activeVariantId: string | null;
  created: boolean;
}

export interface ResumePublicationVerification {
  resumeId: string;
  variantId: string;
  status: "passed" | "needs_revision" | "failed";
  canAccept: boolean;
  violations: Array<{ code: string; message: string; bullet_id?: string }>;
  pageUsageRatio: number;
}

export interface ResumePublicationAcceptResult {
  resumeId: string;
  variantId: string;
  activeVariantId: string;
  gateStatus: "passed";
  publicationStatus: "published";
}

export interface ResumePublicationGateway {
  listResumes(signal?: AbortSignal): Promise<ResumeFull[]>;
  getResume(resumeId: string, signal?: AbortSignal): Promise<ResumeFull>;
  stageNew(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationStageResult>;
  stageVariant(
    payload: ResumeSaveApprovalPayload,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationStageResult>;
  verify(
    resumeId: string,
    variantId: string,
    observation: ResumeBrowserLayoutObservation,
    signal?: AbortSignal,
  ): Promise<ResumePublicationVerification>;
  accept(
    resumeId: string,
    variantId: string,
    signal?: AbortSignal,
  ): Promise<ResumePublicationAcceptResult>;
  reject(
    resumeId: string,
    variantId: string,
    signal?: AbortSignal,
  ): Promise<void>;
}

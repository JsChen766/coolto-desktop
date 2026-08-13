import type {
  ResumeLayoutTargetBand,
  ResumeStructure,
  ResumeTemplateId,
} from "./types.js";

export const RESUME_COMPILE_CHANNEL = "resume-renderer:compile";
export const RESUME_COMPILE_RESULT_CHANNEL = "resume-renderer:result";
export const RESUME_GLOBAL_MINIMUM_USAGE_RATIO = 0.92;
export const RESUME_DEFAULT_TARGET_USAGE_RATIO = 0.95;
export const RESUME_DEFAULT_TARGET_BULLET_TAIL_RATIO = 0.75;
export const RESUME_LAYOUT_TOLERANCE_PX = 1;
export const RESUME_BULLET_LINE_TOLERANCE_PX = 1;

export interface ResumeCompileRequest {
  requestId: string;
  structure: ResumeStructure;
  fixtureId?: string;
}

export interface ResumeBulletMeasurement {
  bulletId: string;
  lineCount: number;
  lastLineWidthPx: number;
  availableLineWidthPx: number;
  lastLineRatio: number;
  passed: boolean;
}

export interface ResumeCompileViolation {
  code:
    | "profile_mismatch"
    | "font_unavailable"
    | "missing_measurement_nodes"
    | "invalid_page_geometry"
    | "missing_bullet_id"
    | "duplicate_bullet_id"
    | "empty_bullet"
    | "invalid_bullet_geometry"
    | "multiple_pages"
    | "page_overflow"
    | "page_underfilled"
    | "page_overfilled"
    | "bullet_tail_too_short";
  message: string;
  bulletId?: string;
}

export interface ResumeCompileResult {
  fixtureId?: string;
  templateId: ResumeTemplateId;
  profileVersion: string;
  profileHash: string;
  qualified: boolean;
  fontsReady: boolean;
  loadedFontFamilies: string[];
  observedAt: string;
  viewport: {
    widthPx: number;
    heightPx: number;
    devicePixelRatio: number;
  };
  pageCount: number;
  overflowPx: number;
  usedHeightPx: number;
  availableHeightPx: number;
  bodyLineHeightPx: number;
  bodyFontSizePx: number;
  usageRatio: number;
  effectiveTargetBand: ResumeLayoutTargetBand;
  bullets: ResumeBulletMeasurement[];
  violations: ResumeCompileViolation[];
}

export interface ResumeCompileResponse {
  requestId: string;
  result?: ResumeCompileResult;
  error?: string;
}

export interface ResumeRendererHostApi {
  onCompile(
    listener: (request: ResumeCompileRequest) => void | Promise<void>,
  ): () => void;
  sendResult(response: ResumeCompileResponse): void;
}

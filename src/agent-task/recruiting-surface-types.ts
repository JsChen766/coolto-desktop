export const RECRUITING_SITE_IDS = [
  "boss_zhipin", "jobsdb_hk", "linkedin", "unknown",
] as const;
export type RecruitingSiteId = (typeof RECRUITING_SITE_IDS)[number];
export type SupportedRecruitingSiteId = Exclude<RecruitingSiteId, "unknown">;

export const RECRUITING_SURFACE_KINDS = [
  "job_listing", "job_detail", "application_form", "auth", "otp",
  "captcha", "legal_declaration", "sensitive_question",
  "submit_confirmation", "unknown",
] as const;
export type RecruitingSurfaceKind = (typeof RECRUITING_SURFACE_KINDS)[number];

export const RECRUITING_CAPABILITIES = [
  "read", "match", "fill", "upload", "field_review", "takeover_required",
  "final_submit_confirmation_required", "unsupported",
] as const;
export type RecruitingCapability = (typeof RECRUITING_CAPABILITIES)[number];

export type RecruitingFallback = "manual_takeover" | "read_only" | "unsupported";

export interface RecruitingFormSummary {
  label?: string;
  name?: string;
  inputType?: string;
  placeholder?: string;
  role?: string;
  required?: boolean;
}

export interface RecruitingAccessibilityObservation {
  role?: string;
  name?: string;
  value?: string;
  description?: string;
  disabled?: boolean;
}

export interface RecruitingFrameShadowSummary {
  sameOriginFrames?: number;
  crossOriginFrames?: number;
  openShadowRoots?: number;
}

export interface RecruitingPageObservation {
  origin: string | null;
  url: string;
  title: string;
  text?: string;
  headings?: readonly string[];
  landmarks?: readonly string[];
  formSummaries?: readonly RecruitingFormSummary[];
  formFields?: readonly RecruitingFormSummary[];
  accessibility?: readonly RecruitingAccessibilityObservation[];
  accessibilityObservations?: readonly RecruitingAccessibilityObservation[];
  frameShadowSummary?: RecruitingFrameShadowSummary;
  frameShadow?: RecruitingFrameShadowSummary;
  frameSummary?: RecruitingFrameShadowSummary;
  observationHash: string | null;
}

export interface RecruitingPageRecognition {
  siteId: RecruitingSiteId;
  surfaceKind: RecruitingSurfaceKind;
  capabilities: RecruitingCapability[];
  fallback: RecruitingFallback;
  observationHash: string | null;
}

export function isRecruitingWriteCapability(
  capability: RecruitingCapability,
): boolean {
  return ["fill", "upload", "field_review",
    "final_submit_confirmation_required"].includes(capability);
}

export function hasFreshRecruitingObservation(
  recognition: Pick<RecruitingPageRecognition, "observationHash">,
  expectedHash: string | null,
): boolean {
  return Boolean(expectedHash && recognition.observationHash === expectedHash);
}

import {
  MaterialContractError,
  type MaterialValidationIssue,
  hasUnsafeMaterialFilename,
  isDenseMaterialArray,
  isIsoTimestamp,
  isMaterialDataProperty,
  isMaterialRecord,
  isSafeMaterialText,
  isSafeOpaqueId,
} from "./material-types.js";
import { MAX_OCR_SEGMENTS } from "./material-ocr-contract.js";

export type OCRProcessingStatus = "not_started" | "processing" | "completed" | "failed";
export interface OCREngineEvidenceV1 { name: string; version: string; }
export interface OCRSegmentConfidenceV1 { segmentId: string; confidence: number; }
export interface OCRConfidenceV1 {
  schema: "material.ocr-confidence";
  version: 1;
  engine: OCREngineEvidenceV1 | null;
  processingStatus: OCRProcessingStatus;
  overallConfidence: number | null;
  segments: OCRSegmentConfidenceV1[];
  needsUserConfirmation: boolean;
  confirmedAt: string | null;
  expiresAt: string | null;
}
export interface OCRTrustPolicyV1 {
  schema: "material.ocr-trust-policy";
  version: 1;
  minimumOverallConfidence: number;
  minimumSegmentConfidence: number;
}
export type OCRTrustReason =
  | "trusted" | "expired" | "processing_incomplete" | "engine_missing" | "overall_missing"
  | "overall_below_threshold" | "segment_evidence_missing" | "segment_below_threshold"
  | "confirmation_required";
export interface OCRTrustDecisionV1 { trusted: boolean; reason: OCRTrustReason; }
export interface OCRConfirmationGateV1 {
  required: boolean;
  allowed: boolean;
  reason: OCRTrustReason | "not_required";
}

const OCR_KEYS = [
  "schema", "version", "engine", "processingStatus", "overallConfidence", "segments",
  "needsUserConfirmation", "confirmedAt", "expiresAt",
] as const;
const ENGINE_KEYS = ["name", "version"] as const;
const SEGMENT_KEYS = ["segmentId", "confidence"] as const;
const POLICY_KEYS = ["schema", "version", "minimumOverallConfidence", "minimumSegmentConfidence"] as const;
const PROCESSING_STATUSES: Record<OCRProcessingStatus, true> = {
  not_started: true, processing: true, completed: true, failed: true,
};

export function normalizeOCRConfidence(input: unknown): OCRConfidenceV1 {
  const issues = validateOCRConfidence(input);
  if (issues.length > 0) throw issueError(issues[0]!);
  const value = input as OCRConfidenceV1;
  return {
    schema: "material.ocr-confidence", version: 1,
    engine: value.engine ? { name: value.engine.name.trim(), version: value.engine.version.trim() } : null,
    processingStatus: value.processingStatus, overallConfidence: value.overallConfidence,
    segments: value.segments.map((segment) => ({ segmentId: segment.segmentId.trim(), confidence: segment.confidence })),
    needsUserConfirmation: value.needsUserConfirmation,
    confirmedAt: value.confirmedAt === null ? null : new Date(value.confirmedAt).toISOString(),
    expiresAt: value.expiresAt === null ? null : new Date(value.expiresAt).toISOString(),
  };
}

export function validateOCRConfidence(input: unknown): MaterialValidationIssue[] {
  const issues: MaterialValidationIssue[] = [];
  if (!isMaterialRecord(input)) return [issue("$", "invalid_input", "OCR confidence must be an object")];
  if (!checkKeys(input, OCR_KEYS, "$", issues)) return issues;
  if (input.schema !== "material.ocr-confidence") issue("schema", "invalid_schema", "invalid OCR schema", issues);
  if (input.version !== 1) issue("version", "invalid_version", "unsupported OCR version", issues);
  if (input.engine !== null) validateEngine(input.engine, issues);
  if (typeof input.processingStatus !== "string" || !Object.hasOwn(PROCESSING_STATUSES, input.processingStatus)) issue("processingStatus", "invalid_enum", "invalid OCR processing status", issues);
  validateConfidence(input.overallConfidence, "overallConfidence", true, issues);
  if (!isDenseMaterialArray(input.segments, MAX_OCR_SEGMENTS)) {
    issue("segments", "invalid_processing", "segments must be a dense bounded array", issues);
  } else {
    const segments = input.segments as readonly unknown[];
    const ids = new Set<string>();
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const path = `segments[${index}]`;
      if (!isMaterialRecord(segment)) { issue(path, "invalid_processing", "segment must be an object", issues); continue; }
      if (!checkKeys(segment, SEGMENT_KEYS, path, issues)) continue;
      if (!isSafeOpaqueId(segment.segmentId) || ids.has(segment.segmentId)) issue(`${path}.segmentId`, "invalid_id", "segment ID must be unique and opaque-safe", issues);
      else ids.add(segment.segmentId);
      validateConfidence(segment.confidence, `${path}.confidence`, false, issues);
    }
  }
  if (typeof input.needsUserConfirmation !== "boolean") issue("needsUserConfirmation", "invalid_processing", "confirmation flag must be boolean", issues);
  validateNullableTimestamp(input.confirmedAt, "confirmedAt", issues);
  validateNullableTimestamp(input.expiresAt, "expiresAt", issues);
  if (input.processingStatus === "completed" && input.overallConfidence === null) issue("overallConfidence", "invalid_processing", "completed OCR requires overall confidence", issues);
  return issues;
}

export function normalizeOCRTrustPolicy(input: unknown): OCRTrustPolicyV1 {
  const issues = validateOCRTrustPolicy(input);
  if (issues.length > 0) throw issueError(issues[0]!);
  const value = input as OCRTrustPolicyV1;
  return { schema: "material.ocr-trust-policy", version: 1, minimumOverallConfidence: value.minimumOverallConfidence, minimumSegmentConfidence: value.minimumSegmentConfidence };
}

export function validateOCRTrustPolicy(input: unknown): MaterialValidationIssue[] {
  const issues: MaterialValidationIssue[] = [];
  if (!isMaterialRecord(input)) return [issue("$", "invalid_input", "OCR policy must be an object")];
  if (!checkKeys(input, POLICY_KEYS, "$", issues)) return issues;
  if (input.schema !== "material.ocr-trust-policy") issue("schema", "invalid_schema", "invalid OCR policy schema", issues);
  if (input.version !== 1) issue("version", "invalid_version", "unsupported OCR policy version", issues);
  validateConfidence(input.minimumOverallConfidence, "minimumOverallConfidence", false, issues);
  validateConfidence(input.minimumSegmentConfidence, "minimumSegmentConfidence", false, issues);
  return issues;
}

export function evaluateOCRConfidence(ocr: OCRConfidenceV1, policy: OCRTrustPolicyV1, now: string): OCRTrustDecisionV1 {
  assertCanonicalInputs(ocr, policy, now);
  const nowMs = Date.parse(now);
  if (ocr.expiresAt !== null && Date.parse(ocr.expiresAt) <= nowMs) return { trusted: false, reason: "expired" };
  if (ocr.processingStatus !== "completed") return { trusted: false, reason: "processing_incomplete" };
  if (ocr.engine === null) return { trusted: false, reason: "engine_missing" };
  if (ocr.overallConfidence === null) return { trusted: false, reason: "overall_missing" };
  if (ocr.overallConfidence < policy.minimumOverallConfidence) return { trusted: false, reason: "overall_below_threshold" };
  if (ocr.segments.length === 0) return { trusted: false, reason: "segment_evidence_missing" };
  if (ocr.segments.some((segment) => segment.confidence < policy.minimumSegmentConfidence)) return { trusted: false, reason: "segment_below_threshold" };
  if (ocr.needsUserConfirmation) return { trusted: false, reason: "confirmation_required" };
  return { trusted: true, reason: "trusted" };
}

export function planOCRUserConfirmation(ocr: OCRConfidenceV1, policy: OCRTrustPolicyV1, now: string): OCRConfirmationGateV1 {
  const decision = evaluateOCRConfidence(ocr, policy, now);
  if (decision.trusted) return { required: false, allowed: false, reason: "not_required" };
  if (decision.reason === "expired" || decision.reason === "processing_incomplete") return { required: false, allowed: false, reason: decision.reason };
  return { required: true, allowed: true, reason: decision.reason };
}

export function isOCRTrustedFact(ocr: OCRConfidenceV1, policy: OCRTrustPolicyV1, now: string): boolean {
  return evaluateOCRConfidence(ocr, policy, now).trusted;
}

function assertCanonicalInputs(ocr: OCRConfidenceV1, policy: OCRTrustPolicyV1, now: string): void {
  const ocrIssues = validateOCRConfidence(ocr);
  const policyIssues = validateOCRTrustPolicy(policy);
  if (ocrIssues.length > 0) throw issueError(ocrIssues[0]!);
  if (policyIssues.length > 0) throw issueError(policyIssues[0]!);
  if (!isIsoTimestamp(now)) throw new MaterialContractError("invalid_timestamp", "now", "invalid evaluation timestamp");
}

function validateEngine(value: unknown, issues: MaterialValidationIssue[]): void {
  if (!isMaterialRecord(value)) { issue("engine", "invalid_processing", "engine evidence must be an object or null", issues); return; }
  if (!checkKeys(value, ENGINE_KEYS, "engine", issues)) return;
  if (typeof value.name !== "string" || !value.name.trim() || !isSafeMaterialText(value.name, 80)) issue("engine.name", "unsafe_value", "engine name is unsafe", issues);
  if (typeof value.version !== "string" || !value.version.trim() || value.version.length > 40 || hasUnsafeMaterialFilename(value.version)) issue("engine.version", "unsafe_value", "engine version is unsafe", issues);
}

function validateConfidence(value: unknown, path: string, nullable: boolean, issues: MaterialValidationIssue[]): void {
  if (nullable && value === null) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) issue(path, "invalid_processing", "confidence must be between 0 and 1", issues);
}

function validateNullableTimestamp(value: unknown, path: string, issues: MaterialValidationIssue[]): void {
  if (value !== null && !isIsoTimestamp(value)) issue(path, "invalid_timestamp", "invalid timestamp", issues);
}

function checkKeys(value: Record<string, unknown>, expected: readonly string[], path: string, issues: MaterialValidationIssue[]): boolean {
  let valid = true;
  try {
    for (const key of expected) if (!Object.hasOwn(value, key)) {
      issue(`${path}.${key}`, "invalid_input", "required field is missing", issues);
      valid = false;
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !expected.includes(key)) {
        issue(`${path}.${typeof key === "string" ? key : "[symbol]"}`, "unknown_field", "unknown field", issues);
        valid = false;
      } else if (!isMaterialDataProperty(value, key)) {
        issue(`${path}.${key}`, "invalid_input", "field must be an enumerable data property", issues);
        valid = false;
      }
    }
  } catch {
    issue(path, "invalid_input", "fields could not be inspected", issues);
    return false;
  }
  return valid;
}


function issue(path: string, code: string, message: string, issues?: MaterialValidationIssue[]): MaterialValidationIssue {
  const value = { path, code, message };
  issues?.push(value);
  return value;
}

function issueError(value: MaterialValidationIssue): MaterialContractError {
  return new MaterialContractError(value.code, value.path, value.message);
}

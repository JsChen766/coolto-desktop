import {
  MATERIAL_ASSET_SCHEMA,
  MATERIAL_ASSET_VERSION,
  MaterialContractError,
  assertMaterialIntakeAuthorized,
  type MaterialAssetV1,
  type MaterialIntakeAuthorizationV1,
  type MaterialMetadataV1,
  type MaterialProcessingStatus,
  type MaterialValidationIssue,
  hasUnsafeMaterialFilename,
  hasUnsafeMaterialText,
  isIsoTimestamp,
  isMaterialDataProperty,
  isMaterialRecord,
  isMaterialSourceKind,
  isSafeOpaqueId,
} from "./material-types.js";
import { normalizeMaterialHash } from "./material-identity.js";
import { normalizeOCRConfidence, validateOCRConfidence } from "./material-ocr-confidence.js";

export { MaterialContractError } from "./material-types.js";

const ASSET_KEYS = ["schema", "version", "identity", "metadata", "processing"] as const;
const IDENTITY_KEYS = ["materialId", "ownerId", "contentHash", "contentVersion"] as const;
const METADATA_KEYS = ["title", "mediaKind", "sourceKind", "sourceLabel", "originalFilename", "capturedAt"] as const;
const PROCESSING_KEYS = ["status", "ocr"] as const;
const MEDIA_KINDS = { pdf: true, docx: true, text: true, markdown: true, png: true, jpg: true, jpeg: true, scanned_pdf: true } as const;
const SOURCE_KINDS = { user_upload: true, user_text: true, delivery_resume: true } as const;
const PROCESSING_STATUSES: Record<MaterialProcessingStatus, true> = { unprocessed: true, processing: true, completed: true, failed: true };

export function normalizeMaterialAsset(input: unknown, authorization?: MaterialIntakeAuthorizationV1): MaterialAssetV1 {
  const issues = validateMaterialAsset(input, authorization);
  if (issues.length > 0) throw issueError(issues[0]!);
  const value = input as MaterialAssetV1;
  assertMaterialIntakeAuthorized(value.metadata.sourceKind, authorization);
  return {
    schema: MATERIAL_ASSET_SCHEMA,
    version: MATERIAL_ASSET_VERSION,
    identity: { materialId: value.identity.materialId.trim(), ownerId: value.identity.ownerId.trim(), contentHash: normalizeMaterialHash(value.identity.contentHash), contentVersion: value.identity.contentVersion },
    metadata: normalizeMetadata(value.metadata),
    processing: { status: value.processing.status, ocr: value.processing.ocr === null ? null : normalizeOCRConfidence(value.processing.ocr) },
  };
}
export function validateMaterialAsset(input: unknown, authorization?: MaterialIntakeAuthorizationV1): MaterialValidationIssue[] {
  const issues: MaterialValidationIssue[] = [];
  if (!isMaterialRecord(input)) return [issue("$", "invalid_input", "material asset must be an object")];
  if (!checkKeys(input, ASSET_KEYS, "$", issues)) return issues;
  if (input.schema !== MATERIAL_ASSET_SCHEMA) issue("schema", "invalid_schema", "invalid material schema", issues);
  if (input.version !== MATERIAL_ASSET_VERSION) issue("version", "invalid_version", "unsupported material version", issues);
  const identity = input.identity;
  if (!isMaterialRecord(identity)) issue("identity", "invalid_input", "identity must be an object", issues); else validateIdentity(identity, issues);
  const metadata = input.metadata;
  if (!isMaterialRecord(metadata)) issue("metadata", "invalid_input", "metadata must be an object", issues);
  else {
    validateMetadata(metadata, issues);
    if (isMaterialDataProperty(metadata, "sourceKind") && isMaterialSourceKind(metadata.sourceKind)) {
      try { assertMaterialIntakeAuthorized(metadata.sourceKind, authorization); }
      catch (error) {
        const contract = error instanceof MaterialContractError ? error : null;
        issue("metadata.sourceKind", contract?.code ?? "not_material_authorized", "material intake is not authorized", issues);
      }
    }
  }
  const processing = input.processing;
  if (!isMaterialRecord(processing)) issue("processing", "invalid_processing", "processing must be an object", issues); else validateProcessing(processing, issues);
  return issues;
}

export function isMaterialAssetV1(input: unknown, authorization?: MaterialIntakeAuthorizationV1): input is MaterialAssetV1 {
  const issues = validateMaterialAsset(input, authorization);
  if (issues.length > 0) return false;
  try { assertMaterialIntakeAuthorized((input as MaterialAssetV1).metadata.sourceKind, authorization); return true; } catch { return false; }
}

export function assertMaterialAssetV1(input: unknown, authorization?: MaterialIntakeAuthorizationV1): asserts input is MaterialAssetV1 {
  const issues = validateMaterialAsset(input, authorization);
  if (issues.length > 0) throw issueError(issues[0]!);
  const value = input as MaterialAssetV1;
  assertMaterialIntakeAuthorized(value.metadata.sourceKind, authorization);
}
function validateIdentity(value: Record<string, unknown>, issues: MaterialValidationIssue[]): void {
  if (!checkKeys(value, IDENTITY_KEYS, "identity", issues)) return;
  if (!isSafeOpaqueId(value.materialId)) issue("identity.materialId", "invalid_id", "material ID is not opaque-safe", issues);
  if (!isSafeOpaqueId(value.ownerId)) issue("identity.ownerId", "invalid_id", "owner ID is not opaque-safe", issues);
  try { normalizeMaterialHash(value.contentHash); } catch { issue("identity.contentHash", "invalid_hash", "content hash is invalid", issues); }
  if (!Number.isSafeInteger(value.contentVersion) || (value.contentVersion as number) < 1) issue("identity.contentVersion", "invalid_version_value", "content version must be positive", issues);
}

function normalizeMetadata(value: MaterialMetadataV1): MaterialMetadataV1 {
  return { title: value.title.trim(), mediaKind: value.mediaKind, sourceKind: value.sourceKind, sourceLabel: value.sourceLabel === null ? null : value.sourceLabel.trim() || null, originalFilename: value.originalFilename === null ? null : value.originalFilename.trim() || null, capturedAt: new Date(value.capturedAt).toISOString() };
}
function validateMetadata(value: Record<string, unknown>, issues: MaterialValidationIssue[]): void {
  if (!checkKeys(value, METADATA_KEYS, "metadata", issues)) return;
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 240 || hasUnsafeMaterialText(value.title)) issue("metadata.title", "unsafe_value", "title is empty or unsafe", issues);
  if (typeof value.mediaKind !== "string" || !Object.hasOwn(MEDIA_KINDS, value.mediaKind)) issue("metadata.mediaKind", "invalid_enum", "unsupported media kind", issues);
  if (typeof value.sourceKind !== "string" || !Object.hasOwn(SOURCE_KINDS, value.sourceKind)) issue("metadata.sourceKind", "invalid_enum", "unsupported source kind", issues);
  validateNullableText(value.sourceLabel, "metadata.sourceLabel", 240, issues);
  if (value.originalFilename !== null && (typeof value.originalFilename !== "string" || value.originalFilename.length > 255 || /[\\/]/u.test(value.originalFilename) || value.originalFilename === "." || value.originalFilename === ".." || hasUnsafeMaterialFilename(value.originalFilename))) issue("metadata.originalFilename", "unsafe_value", "filename must be a safe basename", issues);
  if (!isIsoTimestamp(value.capturedAt)) issue("metadata.capturedAt", "invalid_timestamp", "capturedAt is invalid", issues);
}
function validateProcessing(value: Record<string, unknown>, issues: MaterialValidationIssue[]): void {
  if (!checkKeys(value, PROCESSING_KEYS, "processing", issues)) return;
  if (typeof value.status !== "string" || !Object.hasOwn(PROCESSING_STATUSES, value.status)) issue("processing.status", "invalid_enum", "unsupported processing status", issues);
  if (value.ocr !== null) for (const current of validateOCRConfidence(value.ocr)) issues.push({ ...current, path: `processing.ocr.${current.path}` });
}

function validateNullableText(value: unknown, path: string, maxLength: number, issues: MaterialValidationIssue[]): void {
  if (value !== null && (typeof value !== "string" || value.length > maxLength || hasUnsafeMaterialText(value))) issue(path, "unsafe_value", "text value is unsafe", issues);
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

function issue(path: string, code: string, message: string): MaterialValidationIssue;
function issue(path: string, code: string, message: string, issues: MaterialValidationIssue[]): MaterialValidationIssue;
function issue(path: string, code: string, message: string, issues?: MaterialValidationIssue[]): MaterialValidationIssue {
  const value = { path, code, message };
  issues?.push(value);
  return value;
}

function issueError(value: MaterialValidationIssue): MaterialContractError {
  return new MaterialContractError(value.code, value.path, value.message);
}

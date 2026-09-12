import {
  MaterialContractError,
  type MaterialAssetV1,
  type MaterialIntakeAuthorizationV1,
  type MaterialReferenceV1,
  type MaterialValidationIssue,
  assertMaterialIntakeAuthorized,
  hasUnsafeMaterialText,
  isMaterialDataProperty,
  isMaterialRecord,
  isSafeOpaqueId,
} from "./material-types.js";
import { normalizeMaterialHash } from "./material-identity.js";
import { assertMaterialAssetV1 } from "./material-normalizer.js";

export type MaterialCitationLocationV1 =
  | { kind: "page"; page: number; sectionLabel: string | null }
  | { kind: "paragraph"; paragraph: number; sectionLabel: string | null }
  | { kind: "section"; sectionLabel: string }
  | { kind: "offset"; startOffset: number; endOffset: number; sectionLabel: string | null }
  | { kind: "page_paragraph"; page: number; paragraph: number; sectionLabel: string | null }
  | { kind: "page_paragraph_offset"; page: number; paragraph: number; startOffset: number; endOffset: number; sectionLabel: string | null };

export interface MaterialCitationV1 {
  schema: "material.citation";
  version: 1;
  ownerId: string;
  materialId: string;
  materialHash: string;
  materialVersion: number;
  location: MaterialCitationLocationV1;
}

const CITATION_KEYS = ["schema", "version", "ownerId", "materialId", "materialHash", "materialVersion", "location"] as const;
const LOCATION_KINDS: Record<MaterialCitationLocationV1["kind"], true> = { page: true, paragraph: true, section: true, offset: true, page_paragraph: true, page_paragraph_offset: true };
const MAX_POSITION = 50_000_000;

export function normalizeMaterialCitation(input: unknown, material: MaterialAssetV1 | MaterialReferenceV1, authorization?: MaterialIntakeAuthorizationV1): MaterialCitationV1 {
  assertMaterialCitationMaterial(material, authorization);
  const issues = validateMaterialCitation(input, material, authorization);
  if (issues.length > 0) throw issueError(issues[0]!);
  const value = input as MaterialCitationV1;
  return { schema: "material.citation", version: 1, ownerId: value.ownerId.trim(), materialId: value.materialId.trim(), materialHash: normalizeMaterialHash(value.materialHash), materialVersion: value.materialVersion, location: normalizeLocation(value.location) };
}
export function validateMaterialCitation(input: unknown, material?: MaterialAssetV1 | MaterialReferenceV1, authorization?: MaterialIntakeAuthorizationV1): MaterialValidationIssue[] {
  const issues: MaterialValidationIssue[] = [];
  if (!isMaterialRecord(input)) return [issue("$", "invalid_input", "citation must be an object")];
  if (!checkKeys(input, CITATION_KEYS, "$", issues)) return issues;
  if (input.schema !== "material.citation") issue("schema", "invalid_schema", "invalid citation schema", issues);
  if (input.version !== 1) issue("version", "invalid_version", "unsupported citation version", issues);
  if (!isSafeOpaqueId(input.ownerId) || !isSafeOpaqueId(input.materialId)) issue("identity", "invalid_id", "citation IDs are not opaque-safe", issues);
  let hash: string | null = null;
  try { hash = normalizeMaterialHash(input.materialHash); } catch { issue("materialHash", "invalid_hash", "material hash is invalid", issues); }
  if (typeof input.materialVersion !== "number" || !Number.isSafeInteger(input.materialVersion) || input.materialVersion < 1) issue("materialVersion", "invalid_version_value", "material version must be positive", issues);
  validateLocation(input.location, issues);
  if (material === undefined) {
    issue("material", "invalid_input", "bound material is required", issues);
    return issues;
  }
  let materialValid = true;
  try { assertMaterialCitationMaterial(material, authorization); } catch (error) {
    materialValid = false;
    const contract = error instanceof MaterialContractError ? error : null;
    issue("material", contract?.code ?? "invalid_input", "bound material is invalid", issues);
  }
  if (materialValid && hash !== null) {
    const reference = "identity" in material ? material.identity : material;
    if (input.ownerId !== reference.ownerId || input.materialId !== reference.materialId || hash !== normalizeMaterialHash(reference.contentHash) || input.materialVersion !== reference.contentVersion) issue("$", "citation_material_mismatch", "citation is not bound to this material version", issues);
  }
  return issues;
}

export function citationBindsToMaterial(citation: MaterialCitationV1, material: MaterialAssetV1 | MaterialReferenceV1, authorization?: MaterialIntakeAuthorizationV1): boolean {
  if (validateMaterialCitation(citation, material, authorization).length > 0) return false;
  const reference = "identity" in material ? material.identity : material;
  return citation.ownerId === reference.ownerId && citation.materialId === reference.materialId && citation.materialHash === normalizeMaterialHash(reference.contentHash) && citation.materialVersion === reference.contentVersion;
}

function assertMaterialCitationMaterial(material: MaterialAssetV1 | MaterialReferenceV1, authorization?: MaterialIntakeAuthorizationV1): void {
  if (!isMaterialRecord(material)) throw new MaterialContractError("invalid_input", "material", "bound material must be an object");
  if ("identity" in material) { assertMaterialAssetV1(material, authorization); return; }
  const keys: readonly string[] = ["materialId", "ownerId", "contentHash", "contentVersion", "sourceKind"];
  for (const key of keys) if (!isMaterialDataProperty(material, key)) throw new MaterialContractError("invalid_input", `material.${key}`, "field must be an enumerable data property");
  for (const key of Reflect.ownKeys(material)) {
    if (typeof key !== "string" || !keys.includes(key)) throw new MaterialContractError("unknown_field", `material.${typeof key === "string" ? key : "[symbol]"}`, "unknown field");
  }
  assertMaterialIntakeAuthorized(material.sourceKind, authorization);
  if (!isSafeOpaqueId(material.materialId) || !isSafeOpaqueId(material.ownerId)) throw new MaterialContractError("invalid_id", "material", "material IDs are invalid");
  normalizeMaterialHash(material.contentHash);
  if (!Number.isSafeInteger(material.contentVersion) || material.contentVersion < 1) throw new MaterialContractError("invalid_version_value", "material.contentVersion", "material version is invalid");
}

function normalizeLocation(location: MaterialCitationLocationV1): MaterialCitationLocationV1 {
  const sectionLabel = location.sectionLabel?.trim() || null;
  switch (location.kind) {
    case "page": return { kind: "page", page: location.page, sectionLabel };
    case "paragraph": return { kind: "paragraph", paragraph: location.paragraph, sectionLabel };
    case "section": return { kind: "section", sectionLabel: sectionLabel ?? "" };
    case "offset": return { kind: "offset", startOffset: location.startOffset, endOffset: location.endOffset, sectionLabel };
    case "page_paragraph": return { kind: "page_paragraph", page: location.page, paragraph: location.paragraph, sectionLabel };
    case "page_paragraph_offset": return { kind: "page_paragraph_offset", page: location.page, paragraph: location.paragraph, startOffset: location.startOffset, endOffset: location.endOffset, sectionLabel };
  }
}

function validateLocation(value: unknown, issues: MaterialValidationIssue[]): void {
  if (!isMaterialRecord(value)) { issue("location", "invalid_location", "location must be an object", issues); return; }
  if (!isMaterialDataProperty(value, "kind")) { issue("location.kind", "invalid_input", "kind must be an enumerable data property", issues); return; }
  if (typeof value.kind !== "string" || !Object.hasOwn(LOCATION_KINDS, value.kind)) { issue("location.kind", "invalid_location", "unsupported citation location", issues); return; }
  const kind = value.kind as MaterialCitationLocationV1["kind"];
  const required = kind === "page_paragraph_offset" ? ["kind", "page", "paragraph", "startOffset", "endOffset", "sectionLabel"] : kind === "page_paragraph" ? ["kind", "page", "paragraph", "sectionLabel"] : kind === "page" ? ["kind", "page", "sectionLabel"] : kind === "paragraph" ? ["kind", "paragraph", "sectionLabel"] : kind === "section" ? ["kind", "sectionLabel"] : ["kind", "startOffset", "endOffset", "sectionLabel"];
  if (!checkKeys(value, required, "location", issues)) return;
  if (Object.hasOwn(value, "page")) validatePosition(value.page, "location.page", 1, issues);
  if (Object.hasOwn(value, "paragraph")) validatePosition(value.paragraph, "location.paragraph", 1, issues);
  if (Object.hasOwn(value, "startOffset")) validatePosition(value.startOffset, "location.startOffset", 0, issues);
  if (Object.hasOwn(value, "endOffset")) validatePosition(value.endOffset, "location.endOffset", 1, issues);
  if (typeof value.startOffset === "number" && typeof value.endOffset === "number" && value.endOffset <= value.startOffset) issue("location", "invalid_location", "offset range must be increasing", issues);
  if (value.sectionLabel !== null && (typeof value.sectionLabel !== "string" || value.sectionLabel.length > 120 || hasUnsafeMaterialText(value.sectionLabel))) issue("location.sectionLabel", "unsafe_value", "section label is unsafe", issues);
  if (kind === "section" && (typeof value.sectionLabel !== "string" || !value.sectionLabel.trim())) issue("location.sectionLabel", "invalid_location", "section citation needs a label", issues);
}

function validatePosition(value: unknown, path: string, minimum: number, issues: MaterialValidationIssue[]): void {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > MAX_POSITION) issue(path, "invalid_location", "position is out of range", issues);
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

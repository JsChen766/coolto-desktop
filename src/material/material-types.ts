import type { OCRConfidenceV1 } from "./material-ocr-confidence.js";

export const MATERIAL_ASSET_SCHEMA = "material.asset" as const;
export const MATERIAL_ASSET_VERSION = 1 as const;
export const MATERIAL_CITATION_SCHEMA = "material.citation" as const;
export const MATERIAL_CITATION_VERSION = 1 as const;
export const MATERIAL_RELATION_PROPOSAL_SCHEMA = "material.relation-proposal" as const;
export const MATERIAL_RELATION_PROPOSAL_VERSION = 1 as const;

export type MaterialMediaKind = "pdf" | "docx" | "text" | "markdown" | "png" | "jpg" | "jpeg" | "scanned_pdf";
export type MaterialSourceKind = "user_upload" | "user_text" | "delivery_resume";
export type MaterialProcessingStatus = "unprocessed" | "processing" | "completed" | "failed";

export interface MaterialIdentityV1 {
  materialId: string;
  ownerId: string;
  contentHash: string;
  contentVersion: number;
}

export interface MaterialMetadataV1 {
  title: string;
  mediaKind: MaterialMediaKind;
  sourceKind: MaterialSourceKind;
  sourceLabel: string | null;
  originalFilename: string | null;
  capturedAt: string;
}

export interface MaterialProcessingV1 {
  status: MaterialProcessingStatus;
  ocr: OCRConfidenceV1 | null;
}

export interface MaterialAssetV1 {
  schema: typeof MATERIAL_ASSET_SCHEMA;
  version: typeof MATERIAL_ASSET_VERSION;
  identity: MaterialIdentityV1;
  metadata: MaterialMetadataV1;
  processing: MaterialProcessingV1;
}

export interface MaterialReferenceV1 {
  materialId: string;
  ownerId: string;
  contentHash: string;
  contentVersion: number;
  sourceKind: MaterialSourceKind;
}

export interface MaterialIntakeAuthorizationV1 {
  sourceKind: MaterialSourceKind;
  materialIntent: boolean;
}

export interface MaterialValidationIssue {
  path: string;
  code: string;
  message: string;
}

export type MaterialContractCode =
  | "invalid_input" | "invalid_schema" | "invalid_version" | "unknown_field" | "invalid_id"
  | "invalid_hash" | "invalid_version_value" | "invalid_text" | "invalid_enum"
  | "invalid_timestamp" | "invalid_processing" | "unsafe_value" | "invalid_location"
  | "citation_material_mismatch" | "not_material_authorized";

export class MaterialContractError extends Error {
  public readonly code: string;
  public readonly path: string;

  public constructor(code: string, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "MaterialContractError";
    this.code = code;
    this.path = path;
  }
}

export function assertMaterialIntakeAuthorized(sourceKind: unknown, authorization?: unknown): void {
  if (authorization !== undefined) {
    if (!isMaterialRecord(authorization)) throw new MaterialContractError("invalid_input", "authorization", "authorization must be a plain object");
    const authorizationKeys: readonly string[] = ["sourceKind", "materialIntent"];
    for (const key of authorizationKeys) if (!isMaterialDataProperty(authorization, key)) {
      throw new MaterialContractError("invalid_input", `authorization.${key}`, "authorization field must be an enumerable data property");
    }
    for (const key of Reflect.ownKeys(authorization)) {
      if (typeof key !== "string" || !authorizationKeys.includes(key)) {
        throw new MaterialContractError("unknown_field", `authorization.${typeof key === "string" ? key : "[symbol]"}`, "unknown field");
      }
    }
    if (!isMaterialSourceKind(authorization.sourceKind)) throw new MaterialContractError("invalid_enum", "authorization.sourceKind", "unsupported source kind");
    if (typeof authorization.materialIntent !== "boolean") throw new MaterialContractError("invalid_processing", "authorization.materialIntent", "material intent must be boolean");
  }
  if (!isMaterialSourceKind(sourceKind)) throw new MaterialContractError("invalid_enum", "metadata.sourceKind", "unsupported source kind");
  if (sourceKind === "delivery_resume" && (!isMaterialRecord(authorization) || authorization.sourceKind !== sourceKind || authorization.materialIntent !== true)) {
    throw new MaterialContractError("not_material_authorized", "materialIntent", "delivery Resume requires explicit material intent");
  }
  if (isMaterialRecord(authorization) && authorization.sourceKind !== sourceKind) {
    throw new MaterialContractError("invalid_processing", "authorization.sourceKind", "authorization source does not match asset");
  }
}


export function isMaterialSourceKind(value: unknown): value is MaterialSourceKind {
  return value === "user_upload" || value === "user_text" || value === "delivery_resume";
}
export function isMaterialRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

export function isMaterialDataProperty(value: unknown, key: PropertyKey): boolean {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor !== undefined && descriptor.enumerable === true && Object.hasOwn(descriptor, "value");
  } catch {
    return false;
  }
}

export function isDenseMaterialArray(value: unknown, maxLength = 10_000): value is readonly unknown[] {
  if (!Array.isArray(value) || !Number.isSafeInteger(maxLength) || maxLength < 0 || maxLength > 20_000) return false;
  try {
    if (Object.getPrototypeOf(value) !== Array.prototype) return false;
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    const length = lengthDescriptor?.value;
    if (!lengthDescriptor || typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > maxLength) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (key === "length") continue;
      if (typeof key !== "string" || !isArrayIndexKey(key) || Number(key) >= length || !isMaterialDataProperty(value, key)) return false;
    }
    for (let index = 0; index < length; index += 1) if (!Object.hasOwn(value, index) || !isMaterialDataProperty(value, index)) return false;
    return true;
  } catch {
    return false;
  }
}
function isArrayIndexKey(key: string): boolean {
  if (!/^(?:0|[1-9]\d*)$/u.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index < 0xFFFF_FFFF && String(index) === key;
}


const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const URL_SCHEME_PATTERN = /(?:^[a-z][a-z\d+.-]*:\/\/|^[a-z][a-z\d+.-]*:|\/\/|\b[a-z][a-z\d+.-]*:\/\/)/iu;
const BARE_HOST_PATTERN = /(?:^|[^\p{L}\p{N}_-])(?:www\.)?[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)*\.(?=[\p{L}\p{N}-]*\p{L})[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?=$|[/?#.:,;\s)\]}])/u;
const IP_HOST_PATTERN = /(?:^|[^\p{L}\p{N}_-])(?:\d{1,3}\.){3}\d{1,3}(?=$|[/?#.:,;\s)\]}])/u;
const IPV6_HOST_PATTERN = /(?:^|[^\p{L}\p{N}_-])(?:\[[0-9A-Fa-f:.%A-Za-z0-9_-]+\]|::[0-9A-Fa-f:.%A-Za-z0-9_-]*|[0-9A-Fa-f]{1,4}::[0-9A-Fa-f:.%A-Za-z0-9_-]*|(?:[0-9A-Fa-f]{1,4}:){2,}[0-9A-Fa-f:.%]*)(?=$|[/?#.:,;\s)\]}])/u;
const LOCALHOST_PATTERN = /(?:^|[^\p{L}\p{N}_-])localhost(?=$|[/:?.#,;\s)\]}])/iu;
const ABSOLUTE_PATH_PATTERN = /(?:^|[\s"'=,:;(\[])(?:[A-Za-z]:[\\/]|\/)/u;
const BACKSLASH_PATH_PATTERN = /(?:^|[\s"'=,:;(\[])\\/u;
const POSIX_PATH_PATTERN = /(?:^|[\s"'=,:;(\[])\/(?=[^\s]|$)/u;
const CAMEL_ACRONYM_PATTERN = /(CSRF|JWT|URL|API|HTTP|OTP|ID)(?=[A-Z][a-z])/gu;
const SENSITIVE_KEY_PATTERN = /(?:^|_)(?:authorization|authorizationtoken|auth|authtoken|authkey|bearer|bearertoken|cookie|cookietoken|credential|credentialtoken|password|password_hash|passwordhash|passwd|secret|secretkey|token|api_key|api_token|api_secret|apikey|apitoken|apisecret|access_token|access_key|accesstoken|accesskey|refresh_token|refresh_key|refreshtoken|refreshkey|session|session_id|session_token|sessionid|sessiontoken|otp|captcha|csrf|csrf_token|csrftoken|private_key|privatekey|client_secret|clientsecret|oauth_token|oauthtoken)(?:_|$)/u;
const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/u;
const RAW_BODY_PATTERN = /\braw[-_ ]?(?:body|text)\b/iu;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;

function normalizeMaterialNetworkText(value: string): string {
  const normalized = value.normalize("NFKC");
  return normalized.replace(/\u3001/gu, ",").replace(/[\u3002\uFF61]/gu, ".");
}

function hasSensitiveMaterialText(value: string): boolean {
  const normalized = value.replace(CAMEL_ACRONYM_PATTERN, "$1_").replace(/([a-z0-9])([A-Z])/gu, "$1_$2").replace(/[^A-Za-z0-9]+/gu, "_").toLowerCase();
  return SENSITIVE_KEY_PATTERN.test(normalized);
}

export function isSafeOpaqueId(value: unknown): value is string {
  return typeof value === "string" && OPAQUE_ID_PATTERN.test(value);
}
export function hasUnsafeMaterialText(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const networkValue = normalizeMaterialNetworkText(value);
  return CONTROL_PATTERN.test(value) || URL_SCHEME_PATTERN.test(networkValue) || BARE_HOST_PATTERN.test(networkValue) || IP_HOST_PATTERN.test(networkValue) || IPV6_HOST_PATTERN.test(networkValue) || LOCALHOST_PATTERN.test(networkValue) || ABSOLUTE_PATH_PATTERN.test(networkValue) || BACKSLASH_PATH_PATTERN.test(networkValue) || POSIX_PATH_PATTERN.test(networkValue) || hasSensitiveMaterialText(value) || JWT_PATTERN.test(value) || RAW_BODY_PATTERN.test(value);
}
export function isSafeMaterialText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength && !hasUnsafeMaterialText(value);
}
export function hasUnsafeMaterialFilename(value: unknown): boolean {
  if (typeof value !== "string") return true;
  const networkValue = normalizeMaterialNetworkText(value).replace(/\.(?:pdf|docx|txt|md|markdown|png|jpe?g)$/iu, "");
  return CONTROL_PATTERN.test(value) || URL_SCHEME_PATTERN.test(networkValue) || ABSOLUTE_PATH_PATTERN.test(networkValue) || BACKSLASH_PATH_PATTERN.test(networkValue) || POSIX_PATH_PATTERN.test(networkValue) || BARE_HOST_PATTERN.test(networkValue) || IP_HOST_PATTERN.test(networkValue) || IPV6_HOST_PATTERN.test(networkValue) || LOCALHOST_PATTERN.test(networkValue) || hasSensitiveMaterialText(value) || JWT_PATTERN.test(value) || RAW_BODY_PATTERN.test(value);
}

export function isForbiddenMaterialKey(key: string): boolean {
  return /(?:raw|body|bytes|payload|token|cookie|password|credential|secret|authorization|content|quote)/iu.test(key);
}

const ISO_TIMESTAMP_PATTERN = /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1\d|2[0-3]):[0-5]\d)$/u;

export function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64 || CONTROL_PATTERN.test(value) || URL_SCHEME_PATTERN.test(value) || ABSOLUTE_PATH_PATTERN.test(value) || BACKSLASH_PATH_PATTERN.test(value) || POSIX_PATH_PATTERN.test(value) || hasSensitiveMaterialText(value) || JWT_PATTERN.test(value) || RAW_BODY_PATTERN.test(value)) return false;
  const parts = ISO_TIMESTAMP_PATTERN.exec(value)?.groups;
  if (!parts) return false;
  const maxDay = new Date(Date.UTC(Number(parts.year), Number(parts.month), 0)).getUTCDate();
  return Number(parts.year) > 0 && Number(parts.day) <= maxDay && Number.isFinite(Date.parse(value));
}

import { createHash } from "node:crypto";

import type {
  MaterialAssetV1,
  MaterialIdentityV1,
  MaterialIntakeAuthorizationV1,
  MaterialReferenceV1,
} from "./material-types.js";
import {
  assertMaterialIntakeAuthorized,
  hasUnsafeMaterialFilename,
  hasUnsafeMaterialText,
  isDenseMaterialArray,
  isIsoTimestamp,
  isMaterialDataProperty,
  isMaterialRecord,
  isMaterialSourceKind,
  isSafeOpaqueId,
} from "./material-types.js";
import { validateOCRConfidence } from "./material-ocr-confidence.js";
const MEDIA_KINDS = { pdf: true, docx: true, text: true, markdown: true, png: true, jpg: true, jpeg: true, scanned_pdf: true } as const;
const IDENTITY_KEYS = ["materialId", "ownerId", "contentHash", "contentVersion"] as const;
const REFERENCE_KEYS = ["materialId", "ownerId", "contentHash", "contentVersion", "sourceKind"] as const;
export type MaterialCanonicalValue = null | boolean | number | string | MaterialCanonicalValue[] | { [key: string]: MaterialCanonicalValue };

export function canonicalMaterialJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Material canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new Error("Material canonical JSON rejects unsupported values");
  if (Array.isArray(value)) {
    if (!isDenseMaterialArray(value)) throw new Error("Material canonical JSON rejects invalid arrays");
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value as number;
    const items: string[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error("Material canonical JSON rejects accessor properties");
      items.push(canonicalMaterialJson(descriptor.value));
    }
    return `[${items.join(",")}]`;
  }
  if (!isMaterialRecord(value)) throw new Error("Material canonical JSON rejects non-record objects");
  const keys = Reflect.ownKeys(value);
  const parts: string[] = [];
  for (const key of keys) {
    if (typeof key !== "string" || !isMaterialDataProperty(value, key)) throw new Error("Material canonical JSON rejects hidden or accessor properties");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new Error("Material canonical JSON rejects accessor properties");
    parts.push(`${JSON.stringify(key)}:${canonicalMaterialJson(descriptor.value)}`);
  }
  parts.sort();
  return `{${parts.join(",")}}`;
}

export function hashMaterialBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashMaterialText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function normalizeMaterialHash(value: unknown): string {
  if (typeof value !== "string") throw new Error("Material content hash must be a string");
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) throw new Error("Material content hash must be a SHA-256 hex digest");
  return normalized;
}
export function deriveMaterialId(ownerId: string, contentHash: string, contentVersion = 1): string {
  if (!isSafeOpaqueId(ownerId)) throw new Error("Material owner ID is not opaque-safe");
  const hash = normalizeMaterialHash(contentHash);
  if (!Number.isSafeInteger(contentVersion) || contentVersion < 1) throw new Error("Material content version must be a positive integer");
  return `mat_${hashMaterialText(`${ownerId}\u0000${hash}\u0000${contentVersion}`).slice(0, 32)}`;
}

export function materialIdentityKey(value: MaterialAssetV1 | MaterialIdentityV1 | MaterialReferenceV1, authorization?: MaterialIntakeAuthorizationV1): string {
  const identity = resolveMaterialIdentity(value, authorization);
  return hashMaterialText(canonicalMaterialJson({ materialId: identity.materialId, ownerId: identity.ownerId, contentHash: normalizeMaterialHash(identity.contentHash), contentVersion: identity.contentVersion }));
}

export function materialContentIdentityKey(value: MaterialAssetV1 | MaterialIdentityV1 | MaterialReferenceV1, authorization?: MaterialIntakeAuthorizationV1): string {
  const identity = resolveMaterialIdentity(value, authorization);
  return hashMaterialText(canonicalMaterialJson({ ownerId: identity.ownerId, contentHash: normalizeMaterialHash(identity.contentHash), contentVersion: identity.contentVersion }));
}


export function toMaterialReference(asset: MaterialAssetV1, authorization?: MaterialIntakeAuthorizationV1): MaterialReferenceV1 {
  assertMaterialAssetForReference(asset, authorization);
  return { materialId: asset.identity.materialId.trim(), ownerId: asset.identity.ownerId.trim(), contentHash: normalizeMaterialHash(asset.identity.contentHash), contentVersion: asset.identity.contentVersion, sourceKind: asset.metadata.sourceKind };
}

export function sameMaterialIdentity(
  left: MaterialAssetV1 | MaterialIdentityV1,
  right: MaterialAssetV1 | MaterialIdentityV1,
  authorization?: MaterialIntakeAuthorizationV1,
): boolean {
  return materialIdentityKey(left, authorization) === materialIdentityKey(right, authorization);
}

function resolveMaterialIdentity(value: unknown, authorization?: MaterialIntakeAuthorizationV1): MaterialIdentityV1 {
  if (!isMaterialRecord(value)) throw new Error("Material identity is malformed");
  const looksLikeAsset = Object.hasOwn(value, "metadata") || Object.hasOwn(value, "schema") || Object.hasOwn(value, "version") || Object.hasOwn(value, "processing");
  if (looksLikeAsset) {
    assertMaterialAssetForReference(value, authorization);
    return value.identity;
  }
  if (Object.hasOwn(value, "sourceKind")) {
    assertExactKeys(value, REFERENCE_KEYS);
    if (!isMaterialSourceKind(value.sourceKind)) throw new Error("Material reference source kind is malformed");
    assertMaterialIntakeAuthorized(value.sourceKind, authorization);
  } else {
    assertExactKeys(value, IDENTITY_KEYS);
  }
  assertMaterialIdentity(value as unknown as MaterialIdentityV1);
  return value as unknown as MaterialIdentityV1;
}

function assertMaterialIdentity(identity: MaterialIdentityV1 | MaterialReferenceV1): void {
  if (!isMaterialRecord(identity) || !isSafeOpaqueId(identity.materialId) || !isSafeOpaqueId(identity.ownerId)) throw new Error("Material identity IDs must be opaque-safe");
  normalizeMaterialHash(identity.contentHash);
  if (!Number.isSafeInteger(identity.contentVersion) || identity.contentVersion < 1) throw new Error("Material content version must be a positive integer");
}

function assertMaterialAssetForReference(value: unknown, authorization?: MaterialIntakeAuthorizationV1): asserts value is MaterialAssetV1 {
  if (!isMaterialRecord(value)) throw new Error("Material asset is malformed");
  assertExactKeys(value, ["schema", "version", "identity", "metadata", "processing"]);
  if (value.schema !== "material.asset" || value.version !== 1) throw new Error("Material asset is malformed");
  if (!isMaterialRecord(value.identity) || !isMaterialRecord(value.metadata) || !isMaterialRecord(value.processing)) throw new Error("Material asset is malformed");
  assertExactKeys(value.identity, ["materialId", "ownerId", "contentHash", "contentVersion"]);
  assertExactKeys(value.metadata, ["title", "mediaKind", "sourceKind", "sourceLabel", "originalFilename", "capturedAt"]);
  assertExactKeys(value.processing, ["status", "ocr"]);
  if (!isSafeOpaqueId(value.identity.materialId) || !isSafeOpaqueId(value.identity.ownerId)) throw new Error("Material asset identity is malformed");
  normalizeMaterialHash(value.identity.contentHash);
  if (!Number.isSafeInteger(value.identity.contentVersion) || (value.identity.contentVersion as number) < 1) throw new Error("Material asset version is malformed");
  if (typeof value.metadata.title !== "string" || !value.metadata.title.trim() || value.metadata.title.length > 240 || hasUnsafeMaterialText(value.metadata.title)) throw new Error("Material asset metadata is malformed");
  if (typeof value.metadata.mediaKind !== "string" || !Object.hasOwn(MEDIA_KINDS, value.metadata.mediaKind)) throw new Error("Material asset metadata is malformed");
  if (!isMaterialSourceKind(value.metadata.sourceKind) || (value.metadata.sourceLabel !== null && (typeof value.metadata.sourceLabel !== "string" || value.metadata.sourceLabel.length > 240 || hasUnsafeMaterialText(value.metadata.sourceLabel))) || (value.metadata.originalFilename !== null && (typeof value.metadata.originalFilename !== "string" || value.metadata.originalFilename.length > 255 || /[\\/]/u.test(value.metadata.originalFilename) || value.metadata.originalFilename === "." || value.metadata.originalFilename === ".." || hasUnsafeMaterialFilename(value.metadata.originalFilename))) || !isIsoTimestamp(value.metadata.capturedAt)) throw new Error("Material asset metadata is malformed");
  if (typeof value.processing.status !== "string" || !Object.hasOwn({ unprocessed: true, processing: true, completed: true, failed: true }, value.processing.status)) throw new Error("Material asset processing is malformed");
  if (value.processing.ocr !== null && validateOCRConfidence(value.processing.ocr).length > 0) throw new Error("Material asset OCR is malformed");
  assertMaterialIntakeAuthorized(value.metadata.sourceKind, authorization);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[]): void {
  for (const key of keys) if (!isMaterialDataProperty(value, key)) throw new Error("Material asset field must be an enumerable data property");
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || !keys.includes(key)) throw new Error("Material asset has an unknown field");
  }
}

import {
  MaterialContractError,
  type MaterialAssetV1,
  type MaterialIntakeAuthorizationV1,
  type MaterialMetadataV1,
  isDenseMaterialArray,
  isMaterialDataProperty,
  isMaterialRecord,
} from "./material-types.js";
import {
  canonicalMaterialJson,
  hashMaterialText,
  materialContentIdentityKey,
  normalizeMaterialHash,
  type MaterialCanonicalValue,
} from "./material-identity.js";
import { assertMaterialAssetV1, normalizeMaterialAsset } from "./material-normalizer.js";
const ASSET_SNAPSHOT_KEYS = ["schema", "version", "identity", "metadata", "processing"] as const;
const IDENTITY_SNAPSHOT_KEYS = ["materialId", "ownerId", "contentHash", "contentVersion"] as const;
const METADATA_SNAPSHOT_KEYS = ["title", "mediaKind", "sourceKind", "sourceLabel", "originalFilename", "capturedAt"] as const;
const PROCESSING_SNAPSHOT_KEYS = ["status", "ocr"] as const;
const OCR_SNAPSHOT_KEYS = ["schema", "version", "engine", "processingStatus", "overallConfidence", "segments", "needsUserConfirmation", "confirmedAt", "expiresAt"] as const;
const ENGINE_SNAPSHOT_KEYS = ["name", "version"] as const;
const SEGMENT_SNAPSHOT_KEYS = ["segmentId", "confidence"] as const;
const MAX_DEDUPE_ITEMS = 10_000;

export interface CanonicalMaterialMetadataV1 {
  title: string;
  mediaKind: MaterialMetadataV1["mediaKind"];
  sourceKind: MaterialMetadataV1["sourceKind"];
  sourceLabel: string | null;
  originalFilename: string | null;
}

export interface MaterialDedupePlanV1 {
  dedupeKey: string;
  duplicate: boolean;
  matchingMaterialIds: string[];
  contentIdentityMatches: string[];
}

export function normalizeMaterialMetadataForDedupe(
  metadata: MaterialMetadataV1,
): CanonicalMaterialMetadataV1 {
  return {
    title: normalizeMetadataText(metadata.title),
    mediaKind: metadata.mediaKind,
    sourceKind: metadata.sourceKind,
    sourceLabel: normalizeNullableMetadataText(metadata.sourceLabel),
    originalFilename: normalizeNullableMetadataText(metadata.originalFilename),
  };
}

export function materialDedupeKey(asset: MaterialAssetV1, authorization?: MaterialIntakeAuthorizationV1): string {
  assertMaterialAssetV1(asset, authorization);
  return hashMaterialText(canonicalMaterialJson({
    ownerId: asset.identity.ownerId,
    contentHash: normalizeMaterialHash(asset.identity.contentHash),
    contentVersion: asset.identity.contentVersion,
    metadata: normalizeMaterialMetadataForDedupe(asset.metadata),
  } as unknown as MaterialCanonicalValue));
}

export function planMaterialDedupe(
  candidate: MaterialAssetV1,
  existing: readonly MaterialAssetV1[],
  authorization?: MaterialIntakeAuthorizationV1,
): MaterialDedupePlanV1 {
  if (!isDenseMaterialArray(existing, MAX_DEDUPE_ITEMS)) {
    throw new MaterialContractError("invalid_processing", "existing", "existing materials are out of range");
  }
  const normalizedCandidate = normalizeMaterialAsset(snapshotMaterialAsset(candidate), authorization);
  const candidateKey = materialDedupeKey(normalizedCandidate, authorization);
  const candidateContentIdentityKey = materialContentIdentityKey(normalizedCandidate, authorization);
  const existingLengthDescriptor = Object.getOwnPropertyDescriptor(existing, "length");
  const existingLength = existingLengthDescriptor?.value;
  if (typeof existingLength !== "number") {
    throw new MaterialContractError("invalid_processing", "existing", "existing materials are out of range");
  }
  const verifiedExisting: Array<{ asset: MaterialAssetV1; authorization?: MaterialIntakeAuthorizationV1 }> = [];
  for (let index = 0; index < existingLength; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(existing, index);
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      throw new MaterialContractError("invalid_input", `existing[${index}]`, "existing material must be a data property");
    }
    const snapshot = snapshotMaterialAsset(descriptor.value);
    const sourceKind = isMaterialRecord(snapshot) && isMaterialRecord(snapshot.metadata) ? snapshot.metadata.sourceKind : undefined;
    const currentAuthorization = sourceKind === "delivery_resume" ? authorization : undefined;
    const current = normalizeMaterialAsset(snapshot, currentAuthorization);
    if (currentAuthorization === undefined) verifiedExisting.push({ asset: current });
    else verifiedExisting.push({ asset: current, authorization: currentAuthorization });
  }
  const matchingMaterialIds: string[] = [];
  const contentIdentityMatches: string[] = [];
  for (const verified of verifiedExisting) {
    if (materialDedupeKey(verified.asset, verified.authorization) === candidateKey) matchingMaterialIds.push(verified.asset.identity.materialId);
    if (materialContentIdentityKey(verified.asset, verified.authorization) === candidateContentIdentityKey) {
      contentIdentityMatches.push(verified.asset.identity.materialId);
    }
  }
  matchingMaterialIds.sort();
  contentIdentityMatches.sort();
  return {
    dedupeKey: candidateKey,
    duplicate: matchingMaterialIds.length > 0,
    matchingMaterialIds,
    contentIdentityMatches,
  };
}
type SnapshotProjector = (key: string, value: unknown, path: string, seen: WeakSet<object>) => unknown;

function snapshotMaterialAsset(value: unknown): unknown {
  return snapshotRecord(value, ASSET_SNAPSHOT_KEYS, "material", new WeakSet<object>(), snapshotAssetValue);
}

function snapshotAssetValue(key: string, value: unknown, path: string, seen: WeakSet<object>): unknown {
  if (key === "identity") return snapshotRecord(value, IDENTITY_SNAPSHOT_KEYS, path, seen, snapshotScalar);
  if (key === "metadata") return snapshotRecord(value, METADATA_SNAPSHOT_KEYS, path, seen, snapshotScalar);
  if (key === "processing") return snapshotRecord(value, PROCESSING_SNAPSHOT_KEYS, path, seen, snapshotProcessingValue);
  return snapshotScalar(key, value, path, seen);
}

function snapshotProcessingValue(key: string, value: unknown, path: string, seen: WeakSet<object>): unknown {
  return key === "ocr" && value !== null
    ? snapshotOCR(value, path, seen)
    : snapshotScalar(key, value, path, seen);
}

function snapshotOCR(value: unknown, path: string, seen: WeakSet<object>): unknown {
  return snapshotRecord(value, OCR_SNAPSHOT_KEYS, path, seen, (key, child, childPath, childSeen) => {
    if (key === "engine" && child !== null) return snapshotRecord(child, ENGINE_SNAPSHOT_KEYS, childPath, childSeen, snapshotScalar);
    if (key === "segments") return snapshotArray(child, childPath, childSeen, snapshotSegment);
    return snapshotScalar(key, child, childPath, childSeen);
  });
}

function snapshotSegment(value: unknown, path: string, seen: WeakSet<object>): unknown {
  return snapshotRecord(value, SEGMENT_SNAPSHOT_KEYS, path, seen, snapshotScalar);
}

function snapshotArray(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
  project: (value: unknown, path: string, seen: WeakSet<object>) => unknown,
): unknown[] {
  if (!isDenseMaterialArray(value)) throw new MaterialContractError("invalid_processing", path, "array must be dense and bounded");
  if (seen.has(value)) throw new MaterialContractError("invalid_input", path, "cyclic material input");
  seen.add(value);
  try {
    const length = Object.getOwnPropertyDescriptor(value, "length")?.value as number;
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, index);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new MaterialContractError("invalid_input", `${path}[${index}]`, "array slot must be a data property");
      snapshot.push(project(descriptor.value, `${path}[${index}]`, seen));
    }
    return snapshot;
  } finally {
    seen.delete(value);
  }
}

function snapshotRecord(
  value: unknown,
  expected: readonly string[],
  path: string,
  seen: WeakSet<object>,
  project: SnapshotProjector,
): Record<string, unknown> {
  if (!isMaterialRecord(value)) throw new MaterialContractError("invalid_input", path, "material value must be a plain object");
  if (seen.has(value)) throw new MaterialContractError("invalid_input", path, "cyclic material input");
  try {
    for (const key of expected) if (!isMaterialDataProperty(value, key)) throw new MaterialContractError("invalid_input", `${path}.${key}`, "field must be an enumerable data property");
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !expected.includes(key)) throw new MaterialContractError("unknown_field", `${path}.${typeof key === "string" ? key : "[symbol]"}`, "unknown field");
    }
  } catch (error) {
    if (error instanceof MaterialContractError) throw error;
    throw new MaterialContractError("invalid_input", path, "fields could not be inspected");
  }
  seen.add(value);
  try {
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of expected) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, "value")) throw new MaterialContractError("invalid_input", `${path}.${key}`, "field must be a data property");
      snapshot[key] = project(key, descriptor.value, `${path}.${key}`, seen);
    }
    return snapshot;
  } finally {
    seen.delete(value);
  }
}

function snapshotScalar(_key: string, value: unknown, path: string, _seen: WeakSet<object>): unknown {
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    throw new MaterialContractError("invalid_input", path, "scalar field must not be an object");
  }
  return value;
}

function normalizeMetadataText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function normalizeNullableMetadataText(value: string | null): string | null {
  return value === null ? null : normalizeMetadataText(value);
}

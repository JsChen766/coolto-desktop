import type { MaterialAssetV1, MaterialIntakeAuthorizationV1 } from "./material-types.js";
import { normalizeMaterialAsset } from "./material-normalizer.js";
import type { MaterialCatalogEntry, MaterialRepository, MaterialStoredRecord } from "./material-repository.js";


/** Persist-time intake: delivery_resume assets were authorized at intake/restore; COW rewrite must not strip them. */
function persistenceAuthorization(asset: MaterialAssetV1): MaterialIntakeAuthorizationV1 | undefined {
  return asset.metadata.sourceKind === "delivery_resume"
    ? { sourceKind: "delivery_resume", materialIntent: true }
    : undefined;
}

export function assertMaterialOwner(record: MaterialStoredRecord, ownerId: string | undefined): void {
  if (ownerId && record.asset.identity.ownerId !== ownerId) throw new Error("Material owner scope mismatch");
}

export function normalizeMaterialRecord(record: MaterialStoredRecord): MaterialStoredRecord {
  return {
    ...record,
    bytes: Uint8Array.from(record.bytes),
    asset: normalizeMaterialAsset(record.asset, persistenceAuthorization(record.asset)),
    classification: record.classification ?? "unclassified",
    parsedChunks: record.parsedChunks.map((chunk) => ({ ...chunk })),
    ocrSegments: record.ocrSegments.map((segment) => ({ ...segment, bbox: segment.bbox ? { ...segment.bbox } : null })),
    ocrBinding: record.ocrBinding ? { ...record.ocrBinding } : undefined,
    relations: record.relations.map(cloneRelation),
  };
}

export function cloneMaterialRecord(record: MaterialStoredRecord): MaterialStoredRecord {
  return normalizeMaterialRecord(record);
}

export function toMaterialCatalogEntry(record: MaterialStoredRecord | MaterialCatalogEntry): MaterialCatalogEntry {
  return {
    asset: normalizeMaterialAsset(record.asset, persistenceAuthorization(record.asset)),
    lifecycleStatus: record.lifecycleStatus,
    classification: record.classification ?? "unclassified",
    relations: record.relations.map(cloneRelation),
    lastError: record.lastError,
  };
}

export function assertImmutableMaterialRaw(previous: MaterialStoredRecord, next: MaterialStoredRecord): void {
  if (previous.asset.identity.ownerId !== next.asset.identity.ownerId
    || previous.asset.identity.contentHash !== next.asset.identity.contentHash
    || previous.asset.identity.contentVersion !== next.asset.identity.contentVersion
    || Buffer.compare(Buffer.from(previous.bytes), Buffer.from(next.bytes)) !== 0) {
    throw new Error("材料原始字节不可变；请创建新的材料版本");
  }
}

export type MaterialRepositoryPort = MaterialRepository;
export type MaterialAssetShape = MaterialAssetV1;

function cloneRelation(relation: MaterialStoredRecord["relations"][number]): MaterialStoredRecord["relations"][number] {
  return { ...relation, citations: structuredClone(relation.citations) };
}

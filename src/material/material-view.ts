import type {
  MaterialCatalogEntry,
  MaterialClassification,
  MaterialRepository,
  MaterialStoredRecord,
} from "./material-repository.js";

export interface MaterialView {
  materialId: string;
  title: string;
  mediaKind: string;
  sourceKind: string;
  sourceLabel: string | null;
  originalFilename: string | null;
  capturedAt: string;
  contentHash: string;
  contentVersion: number;
  classification: MaterialClassification;
  status: MaterialStoredRecord["lifecycleStatus"];
  processingStatus: MaterialStoredRecord["asset"]["processing"]["status"];
  previewText: string | null;
  previewTruncated: boolean;
  ocrConfidence: number | null;
  needsUserConfirmation: boolean;
  expiresAt: string | null;
  relationCount: number;
  citationCount: number;
  relatedExperienceIds: string[];
  lastError: string | null;
}

export interface MaterialSearchOptions {
  query?: string;
  status?: MaterialStoredRecord["lifecycleStatus"];
  classification?: MaterialClassification;
  limit?: number;
}

export class MaterialViewService {
  public constructor(private readonly repository: MaterialRepository) {}

  public async list(options: MaterialSearchOptions = {}): Promise<MaterialView[]> {
    if (options.query?.trim()) return this.search(options);
    const entries = await this.repository.list();
    const views = entries
      .filter((entry) => matchesCatalog(entry, options))
      .map((entry) => toMaterialViewFromCatalog(entry));
    return views.slice(0, Math.max(1, Math.min(options.limit ?? 100, 500)));
  }

  public async get(materialId: string): Promise<MaterialView | undefined> {
    const record = await this.repository.get(materialId);
    return record ? toMaterialView(record) : undefined;
  }

  public async search(options: MaterialSearchOptions = {}): Promise<MaterialView[]> {
    const records = await this.repository.exportAll();
    const filtered = records.filter((record) => matchesRecord(record, options));
    return filtered
      .sort((left, right) => right.asset.metadata.capturedAt.localeCompare(left.asset.metadata.capturedAt))
      .slice(0, Math.max(1, Math.min(options.limit ?? 100, 500)))
      .map(toMaterialView);
  }
}

export function toMaterialView(record: MaterialStoredRecord): MaterialView {
  const previewSource = record.ocrText ?? record.parsedText;
  const previewText = previewSource?.trim().slice(0, 1_200) || null;
  const expired = isOcrExpired(record.asset.processing.ocr?.expiresAt);
  return {
    materialId: record.asset.identity.materialId,
    title: record.asset.metadata.title,
    mediaKind: record.asset.metadata.mediaKind,
    sourceKind: record.asset.metadata.sourceKind,
    sourceLabel: record.asset.metadata.sourceLabel,
    originalFilename: record.asset.metadata.originalFilename,
    capturedAt: record.asset.metadata.capturedAt,
    contentHash: record.asset.identity.contentHash,
    contentVersion: record.asset.identity.contentVersion,
    classification: record.classification ?? "unclassified",
    status: expired ? "expired" : displayStatus(record.classification ?? "unclassified", record.lifecycleStatus),
    processingStatus: record.asset.processing.status,
    previewText,
    previewTruncated: Boolean(previewSource && previewSource.length > 1_200),
    ocrConfidence: record.asset.processing.ocr?.overallConfidence ?? null,
    needsUserConfirmation: record.asset.processing.ocr?.needsUserConfirmation ?? false,
    expiresAt: record.asset.processing.ocr?.expiresAt ?? null,
    relationCount: record.relations.length,
    citationCount: record.relations.reduce((count, relation) => count + relation.citations.length, 0),
    relatedExperienceIds: relatedExperienceIdsFrom(record.relations),
    lastError: record.lastError,
  };
}

function toMaterialViewFromCatalog(entry: MaterialCatalogEntry): MaterialView {
  return {
    materialId: entry.asset.identity.materialId,
    title: entry.asset.metadata.title,
    mediaKind: entry.asset.metadata.mediaKind,
    sourceKind: entry.asset.metadata.sourceKind,
    sourceLabel: entry.asset.metadata.sourceLabel,
    originalFilename: entry.asset.metadata.originalFilename,
    capturedAt: entry.asset.metadata.capturedAt,
    contentHash: entry.asset.identity.contentHash,
    contentVersion: entry.asset.identity.contentVersion,
    classification: entry.classification,
    status: isOcrExpired(entry.asset.processing.ocr?.expiresAt) ? "expired" : displayStatus(entry.classification, entry.lifecycleStatus),
    processingStatus: entry.asset.processing.status,
    previewText: null,
    previewTruncated: false,
    ocrConfidence: entry.asset.processing.ocr?.overallConfidence ?? null,
    needsUserConfirmation: entry.asset.processing.ocr?.needsUserConfirmation ?? false,
    expiresAt: entry.asset.processing.ocr?.expiresAt ?? null,
    relationCount: entry.relations.length,
    citationCount: entry.relations.reduce((count, relation) => count + relation.citations.length, 0),
    relatedExperienceIds: relatedExperienceIdsFrom(entry.relations),
    lastError: entry.lastError,
  };
}

function matchesCatalog(entry: MaterialCatalogEntry, options: MaterialSearchOptions): boolean {
  if (!matchesFilters(entry, options)) return false;
  const query = options.query?.trim().toLocaleLowerCase();
  if (!query) return true;
  return matchesQuery(query, entry.asset.metadata.title, entry.asset.metadata.originalFilename, entry.asset.metadata.sourceLabel);
}

function matchesRecord(record: MaterialStoredRecord, options: MaterialSearchOptions): boolean {
  const entry = {
    asset: record.asset,
    lifecycleStatus: record.lifecycleStatus,
    classification: record.classification ?? "unclassified",
    relations: record.relations,
    lastError: record.lastError,
  };
  if (!matchesFilters(entry, options)) return false;
  const query = options.query?.trim().toLocaleLowerCase();
  return !query || matchesQuery(
    query,
    record.asset.metadata.title,
    record.asset.metadata.originalFilename,
    record.asset.metadata.sourceLabel,
    record.parsedText,
    record.ocrText,
  );
}

function matchesFilters(entry: MaterialCatalogEntry, options: MaterialSearchOptions): boolean {
  if (options.status && (isOcrExpired(entry.asset.processing.ocr?.expiresAt) ? "expired" : displayStatus(entry.classification, entry.lifecycleStatus)) !== options.status) return false;
  return !options.classification || entry.classification === options.classification;
}

function matchesQuery(query: string, ...values: Array<string | null | undefined>): boolean {
  return values.some((value) => value?.toLocaleLowerCase().includes(query));
}


function relatedExperienceIdsFrom(relations: readonly { experienceId: string }[]): string[] {
  return [...new Set(relations.map((relation) => relation.experienceId))]
    .sort((left, right) => left.localeCompare(right));
}
function displayStatus(classification: MaterialClassification, lifecycleStatus: MaterialStoredRecord["lifecycleStatus"]): MaterialStoredRecord["lifecycleStatus"] {
  return classification === "unclassified" && lifecycleStatus === "ready" ? "unclassified" : lifecycleStatus;
}
function isOcrExpired(expiresAt: string | null | undefined): boolean {
  return expiresAt !== null && expiresAt !== undefined && Date.parse(expiresAt) <= Date.now();
}

import { join } from "node:path";

import type { ParsedMaterialChunk } from "../files/parse-selected-file.js";
import type { MaterialAssetV1 } from "./material-types.js";
import { EncryptedMaterialApprovalJournal, type MaterialApprovalJournal } from "./material-proposal-journal.js";
import { MaterialGenerationStore } from "./material-repository-generation.js";
import { assertImmutableMaterialRaw, assertMaterialOwner, cloneMaterialRecord, normalizeMaterialRecord } from "./material-repository-helpers.js";

export { MemoryMaterialRepository } from "./material-repository-memory.js";

export type MaterialLifecycleStatus = "unclassified" | "queued" | "processing" | "needs_confirmation" | "ready" | "failed" | "expired";
export type MaterialClassification = "unclassified" | "classified";
export interface MaterialOcrSegmentRecord { segmentId: string; text: string; confidence: number; page: number | null; bbox: { x: number; y: number; width: number; height: number } | null; }
export interface MaterialOcrBinding {
  ownerId: string;
  materialHash: string;
  materialVersion: number;
  jobId: string;
  resultHash: string;
  policy?: { minimumOverallConfidence: number; minimumSegmentConfidence: number };
  confirmedAt?: string | null;
}
export interface MaterialRelationRecord { relationId: string; experienceId: string; citations: readonly unknown[]; createdAt: string; }
export interface MaterialStoredRecord {
  asset: MaterialAssetV1;
  lifecycleStatus: MaterialLifecycleStatus;
  classification?: MaterialClassification;
  bytes: Uint8Array;
  parsedText: string | null;
  parsedChunks: readonly ParsedMaterialChunk[];
  ocrText: string | null;
  ocrSegments: readonly MaterialOcrSegmentRecord[];
  ocrBinding?: MaterialOcrBinding | undefined;
  relations: readonly MaterialRelationRecord[];
  lastError: string | null;
}
export interface MaterialCatalogEntry {
  asset: MaterialAssetV1;
  lifecycleStatus: MaterialLifecycleStatus;
  classification: MaterialClassification;
  relations: readonly MaterialRelationRecord[];
  lastError: string | null;
}
export interface MaterialRepository {
  list(): Promise<MaterialCatalogEntry[]>;
  get(materialId: string): Promise<MaterialStoredRecord | undefined>;
  save(record: MaterialStoredRecord): Promise<MaterialStoredRecord>;
  saveMany(records: readonly MaterialStoredRecord[]): Promise<MaterialStoredRecord[]>;
  update(materialId: string, update: (record: MaterialStoredRecord) => MaterialStoredRecord): Promise<MaterialStoredRecord>;
  compareAndSave(materialId: string, expectedHash: string, update: (record: MaterialStoredRecord) => MaterialStoredRecord): Promise<MaterialStoredRecord>;
  compareAndRemove(materialId: string, expectedHash: string, verify: (record: MaterialStoredRecord) => boolean): Promise<void>;
  proposalJournal(): MaterialApprovalJournal;
  remove(materialId: string): Promise<void>;
  clear(): Promise<void>;
  exportAll(): Promise<MaterialStoredRecord[]>;
}

/** Owner-scoped encrypted COW store. Every mutation rereads the root's committed generation under its cross-process lock. */
export class EncryptedMaterialRepository implements MaterialRepository {
  readonly #root: string;
  readonly #key: Buffer;
  readonly #ownerId: string;
  readonly #scopeKey: string;
  readonly #store: MaterialGenerationStore;
  readonly #proposalJournal: MaterialApprovalJournal;
  readonly #ready: Promise<void>;
  #writeQueue: Promise<void> = Promise.resolve();

  public constructor(root: string, ownerId: string, key: Uint8Array, scopeKey = "default") {
    if (!ownerId.trim()) throw new Error("Material owner is required");
    if (key.byteLength !== 32) throw new Error("Material repository key must be 32 bytes");
    this.#ownerId = ownerId.trim();
    this.#scopeKey = scopeKey;
    this.#root = join(root, scopeName(this.#ownerId));
    this.#key = Buffer.from(key);
    this.#store = new MaterialGenerationStore(this.#root, this.#key, this.#ownerId, (value) => this.#aad(value));
    this.#proposalJournal = new EncryptedMaterialApprovalJournal(this.#root, this.#key, this.#aad("proposal-journal"));
    this.#ready = this.#store.load();
  }

  public proposalJournal(): MaterialApprovalJournal { return this.#proposalJournal; }
  public async list(): Promise<MaterialCatalogEntry[]> { await this.#ready; return this.#store.list(); }
  public async get(materialId: string): Promise<MaterialStoredRecord | undefined> { await this.#ready; return this.#store.get(materialId); }
  public async save(record: MaterialStoredRecord): Promise<MaterialStoredRecord> { await this.#ready; return this.#enqueueWrite(async () => (await this.#saveMany([record]))[0]!); }
  public async saveMany(records: readonly MaterialStoredRecord[]): Promise<MaterialStoredRecord[]> { await this.#ready; return this.#enqueueWrite(() => this.#saveMany(records)); }
  public async update(materialId: string, update: (record: MaterialStoredRecord) => MaterialStoredRecord): Promise<MaterialStoredRecord> {
    await this.#ready;
    return this.#enqueueWrite(() => this.#store.transaction((next) => {
      const current = next.get(materialId.trim());
      if (!current) throw new Error(`Material ${materialId} 不存在`);
      return this.#applyRecords(next, [update(cloneMaterialRecord(current))])[0]!;
    }));
  }
  public async compareAndSave(materialId: string, expectedHash: string, update: (record: MaterialStoredRecord) => MaterialStoredRecord): Promise<MaterialStoredRecord> {
    await this.#ready;
    return this.#enqueueWrite(() => this.#store.transaction((next) => {
      const current = next.get(materialId.trim());
      if (!current || current.asset.identity.contentHash !== expectedHash) throw new Error("材料已删除或版本已变化，请重新确认");
      return this.#applyRecords(next, [update(cloneMaterialRecord(current))])[0]!;
    }));
  }
  public async compareAndRemove(materialId: string, expectedHash: string, verify: (record: MaterialStoredRecord) => boolean): Promise<void> {
    await this.#ready;
    await this.#enqueueWrite(() => this.#store.transaction((next) => {
      const current = next.get(materialId.trim());
      if (!current || current.asset.identity.contentHash !== expectedHash || !verify(cloneMaterialRecord(current))) throw new Error("材料已变化，请重新查看删除影响");
      next.delete(current.asset.identity.materialId);
    }));
  }
  public async remove(materialId: string): Promise<void> {
    await this.#ready;
    await this.#enqueueWrite(() => this.#store.transaction((next) => { next.delete(materialId.trim()); }));
  }
  public async clear(): Promise<void> {
    await this.#ready;
    await this.#enqueueWrite(() => this.#store.clear());
  }
  public async exportAll(): Promise<MaterialStoredRecord[]> { await this.#ready; return [...(await this.#store.records()).values()].map(cloneMaterialRecord); }

  async #saveMany(records: readonly MaterialStoredRecord[]): Promise<MaterialStoredRecord[]> {
    return this.#store.transaction((next) => this.#applyRecords(next, records));
  }
  #applyRecords(next: Map<string, MaterialStoredRecord>, records: readonly MaterialStoredRecord[]): MaterialStoredRecord[] {
    const normalized = records.map(normalizeMaterialRecord);
    const ids = new Set<string>();
    for (const record of normalized) {
      assertMaterialOwner(record, this.#ownerId);
      const id = record.asset.identity.materialId;
      if (ids.has(id)) throw new Error(`Material ${id} 重复提交`);
      ids.add(id);
      const previous = next.get(id);
      if (previous) assertImmutableMaterialRaw(previous, record);
      next.set(id, record);
    }
    return normalized.map(cloneMaterialRecord);
  }
  #aad(value: string): string { return `coolto-material:v1:${this.#ownerId}:${this.#scopeKey}:${value}`; }
  async #enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#writeQueue;
    let release!: () => void;
    this.#writeQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}

function scopeName(ownerId: string): string { return Buffer.from(ownerId.trim(), "utf8").toString("base64url"); }

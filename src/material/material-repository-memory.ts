import type { MaterialCatalogEntry, MaterialRepository, MaterialStoredRecord } from "./material-repository.js";
import { MemoryMaterialApprovalJournal, type MaterialApprovalJournal } from "./material-proposal-journal.js";
import {
  assertMaterialOwner,
  assertImmutableMaterialRaw,
  cloneMaterialRecord,
  normalizeMaterialRecord,
  toMaterialCatalogEntry,
} from "./material-repository-helpers.js";

export class MemoryMaterialRepository implements MaterialRepository {
  readonly #records = new Map<string, MaterialStoredRecord>();
  readonly #ownerId: string | undefined;
  readonly #proposalJournal = new MemoryMaterialApprovalJournal();

  public constructor(ownerId?: string) {
    this.#ownerId = ownerId?.trim() || undefined;
  }

  public async list(): Promise<MaterialCatalogEntry[]> {
    return [...this.#records.values()].map(toMaterialCatalogEntry);
  }

  public async get(materialId: string): Promise<MaterialStoredRecord | undefined> {
    const record = this.#records.get(materialId.trim());
    return record ? cloneMaterialRecord(record) : undefined;
  }
  public proposalJournal(): MaterialApprovalJournal { return this.#proposalJournal; }

  public async save(record: MaterialStoredRecord): Promise<MaterialStoredRecord> {
    assertMaterialOwner(record, this.#ownerId);
    const normalized = normalizeMaterialRecord(record);
    const previous = this.#records.get(normalized.asset.identity.materialId);
    if (previous) assertImmutableMaterialRaw(previous, normalized);
    this.#records.set(normalized.asset.identity.materialId, normalized);
    return cloneMaterialRecord(normalized);
  }
  public async saveMany(records: readonly MaterialStoredRecord[]): Promise<MaterialStoredRecord[]> {
    const normalized = records.map(normalizeMaterialRecord);
    const next = new Map(this.#records);
    const ids = new Set<string>();
    for (const item of normalized) {
      assertMaterialOwner(item, this.#ownerId);
      const id = item.asset.identity.materialId;
      if (ids.has(id)) throw new Error(`Material ${id} 重复提交`);
      ids.add(id);
      const previous = next.get(id);
      if (previous) assertImmutableMaterialRaw(previous, item);
      next.set(id, item);
    }
    this.#records.clear();
    for (const [id, item] of next) this.#records.set(id, item);
    return normalized.map(cloneMaterialRecord);
  }

  public async update(materialId: string, update: (record: MaterialStoredRecord) => MaterialStoredRecord): Promise<MaterialStoredRecord> {
    const current = await this.get(materialId);
    if (!current) throw new Error(`Material ${materialId} 不存在`);
    return this.save(update(current));
  }
  public async compareAndSave(materialId: string, expectedHash: string, update: (record: MaterialStoredRecord) => MaterialStoredRecord): Promise<MaterialStoredRecord> {
    const current = await this.get(materialId);
    if (!current || current.asset.identity.contentHash !== expectedHash) throw new Error("材料已删除或版本已变化，请重新确认");
    return this.save(update(current));
  }

  public async compareAndRemove(materialId: string, expectedHash: string, verify: (record: MaterialStoredRecord) => boolean): Promise<void> {
    const current = this.#records.get(materialId.trim());
    if (!current || current.asset.identity.contentHash !== expectedHash || !verify(cloneMaterialRecord(current))) {
      throw new Error("材料已变化，请重新查看删除影响");
    }
    this.#records.delete(materialId.trim());
  }

  public async remove(materialId: string): Promise<void> {
    this.#records.delete(materialId.trim());
  }

  public async clear(): Promise<void> {
    this.#records.clear();
    await this.#proposalJournal.clear();
  }

  public async exportAll(): Promise<MaterialStoredRecord[]> {
    return [...this.#records.values()].map(cloneMaterialRecord);
  }
}

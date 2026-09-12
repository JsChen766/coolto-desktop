import type { MaterialCatalogEntry, MaterialStoredRecord } from "./material-repository.js";
import {
  assertMaterialOwner,
  assertImmutableMaterialRaw,
  cloneMaterialRecord,
  normalizeMaterialRecord,
  toMaterialCatalogEntry,
} from "./material-repository-helpers.js";

export interface MaterialBatchContext {
  ownerId: string;
  catalog: Map<string, MaterialCatalogEntry>;
  records: readonly MaterialStoredRecord[];
  get(materialId: string): Promise<MaterialStoredRecord | undefined>;
  write(record: MaterialStoredRecord): Promise<void>;
  remove(materialId: string): Promise<void>;
  saveCatalog(): Promise<void>;
}

export async function saveMaterialBatch(context: MaterialBatchContext): Promise<MaterialStoredRecord[]> {
  const normalized = context.records.map(normalizeMaterialRecord);
  const previous = new Map(context.catalog);
  const originals = new Map<string, MaterialStoredRecord>();
  const ids = new Set<string>();
  try {
    for (const item of normalized) {
      assertMaterialOwner(item, context.ownerId);
      const id = item.asset.identity.materialId;
      if (ids.has(id)) throw new Error(`Material ${id} 重复提交`);
      ids.add(id);
      const old = await context.get(id);
      if (old) { assertImmutableMaterialRaw(old, item); originals.set(id, old); }
    }
    for (const item of normalized) await context.write(item);
    for (const item of normalized) context.catalog.set(item.asset.identity.materialId, toMaterialCatalogEntry(item));
    await context.saveCatalog();
    return normalized.map(cloneMaterialRecord);
  } catch (error) {
    context.catalog.clear();
    for (const [id, item] of previous) context.catalog.set(id, item);
    for (const item of normalized) {
      const old = originals.get(item.asset.identity.materialId);
      if (old) await context.write(old);
      else await context.remove(item.asset.identity.materialId);
    }
    await context.saveCatalog().catch(() => undefined);
    throw error;
  }
}

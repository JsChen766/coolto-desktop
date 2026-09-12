import type {
  MaterialCatalogEntry,
  MaterialRepository,
  MaterialStoredRecord,
} from "../../../material/material-repository.js";

export class MaterialCatalogStore {
  public constructor(private readonly repository: MaterialRepository) {}

  public list(): Promise<MaterialCatalogEntry[]> {
    return this.repository.list();
  }

  public get(materialId: string): Promise<MaterialStoredRecord | undefined> {
    return this.repository.get(materialId);
  }

  public save(record: MaterialStoredRecord): Promise<MaterialStoredRecord> {
    return this.repository.save(record);
  }

  public update(
    materialId: string,
    update: (record: MaterialStoredRecord) => MaterialStoredRecord,
  ): Promise<MaterialStoredRecord> {
    return this.repository.update(materialId, update);
  }

  public remove(materialId: string): Promise<void> {
    return this.repository.remove(materialId);
  }

  public clear(): Promise<void> {
    return this.repository.clear();
  }
}

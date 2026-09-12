import { hashMaterialBytes } from "./material-identity.js";
import { parseMaterialExportPackage, toMaterialExportRecord, type MaterialExportPackageV1 } from "./material-export-restore-validation.js";
import type { MaterialRepository } from "./material-repository.js";

export type { MaterialExportPackageV1 } from "./material-export-restore-validation.js";

export class MaterialExportService {
  public constructor(private readonly repository: MaterialRepository) {}

  public async export(ownerId: string): Promise<MaterialExportPackageV1> {
    const records = await this.repository.exportAll();
    if (records.some((record) => record.asset.identity.ownerId !== ownerId)) {
      throw new Error("材料仓库账号范围不一致");
    }
    for (const record of records) {
      if (hashMaterialBytes(record.bytes) !== record.asset.identity.contentHash) {
        throw new Error(`材料 ${record.asset.identity.materialId} 原始字节指纹不匹配`);
      }
    }
    return {
      schema: "material.export",
      version: 1,
      ownerId,
      exportedAt: new Date().toISOString(),
      records: records.map(toMaterialExportRecord),
    };
  }

  public async encode(ownerId: string): Promise<Buffer> {
    return Buffer.from(JSON.stringify(await this.export(ownerId)), "utf8");
  }

  public async restore(ownerId: string, input: MaterialExportPackageV1 | Uint8Array): Promise<number> {
    let value: MaterialExportPackageV1;
    try {
      value = input instanceof Uint8Array
        ? JSON.parse(Buffer.from(input).toString("utf8")) as MaterialExportPackageV1
        : input;
    } catch {
      throw new Error("材料导出包不是有效 JSON");
    }
    const prepared = parseMaterialExportPackage(value, ownerId);
    const existing = await Promise.all(prepared.map((item) => this.repository.get(item.asset.identity.materialId)));
    for (let index = 0; index < prepared.length; index += 1) {
      const current = existing[index];
      if (!current) continue;
      const next = prepared[index]!;
      if (current.asset.identity.ownerId !== ownerId
        || current.asset.identity.contentHash !== next.asset.identity.contentHash
        || current.asset.identity.contentVersion !== next.asset.identity.contentVersion
        || Buffer.compare(Buffer.from(current.bytes), Buffer.from(next.bytes)) !== 0) {
        throw new Error(`材料 ${next.asset.identity.materialId} 已存在但内容不一致`);
      }
    }
    const missing = prepared.filter((_item, index) => !existing[index]);
    await this.repository.saveMany(missing);
    return missing.length;
  }
}

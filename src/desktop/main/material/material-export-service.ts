import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import type { MaterialRepository } from "../../../material/material-repository.js";
import { MaterialExportService as CoreMaterialExportService } from "../../../material/material-export.js";
import type { MaterialExportReceipt } from "../../shared/types/material.js";

export class DesktopMaterialExportService {
  readonly #service: CoreMaterialExportService;

  public constructor(
    repository: MaterialRepository,
    private readonly ownerId: string,
  ) {
    this.#service = new CoreMaterialExportService(repository);
  }

  public encode(): Promise<Buffer> {
    return this.#service.encode(this.ownerId);
  }

  public restore(payload: Uint8Array): Promise<number> {
    return this.#service.restore(this.ownerId, payload);
  }

  public async exportToFile(filePath: string): Promise<MaterialExportReceipt> {
    const payload = await this.encode();
    await writeFile(filePath, payload, { mode: 0o600 });
    const decoded = JSON.parse(payload.toString("utf8")) as { records?: unknown[] };
    return {
      recordCount: Array.isArray(decoded.records) ? decoded.records.length : 0,
      byteLength: payload.byteLength,
      sha256: createHash("sha256").update(payload).digest("hex"),
    };
  }

  public async restoreFromFile(filePath: string): Promise<number> {
    return this.restore(await readFile(filePath));
  }
}

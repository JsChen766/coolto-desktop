import type { BrowserFieldWriteRecord } from "../../../browser/types.js";

export type BrowserFieldWriteMeta = Pick<
  BrowserFieldWriteRecord,
  "elementType" | "label" | "valueAfter" | "valueBefore"
>;

export class BrowserFillLog {
  readonly #records: BrowserFieldWriteRecord[] = [];

  public get hasEntries(): boolean { return this.#records.length > 0; }
  public clear(): void { this.#records.length = 0; }
  public list(): BrowserFieldWriteRecord[] { return structuredClone(this.#records); }

  public record(fillId: string, meta: BrowserFieldWriteMeta): void {
    const existing = this.#records.find((record) => record.fillId === fillId);
    if (existing) {
      existing.valueAfter = meta.valueAfter;
      existing.label = meta.label || existing.label;
      existing.elementType = meta.elementType;
      existing.writtenAt = new Date().toISOString();
      return;
    }
    this.#records.push({
      fillId,
      ...structuredClone(meta),
      writtenAt: new Date().toISOString(),
    });
  }
}

import type {
  BrowserDownloadStatus,
  BrowserDownloadView,
} from "../desktop/shared/types/browser.js";

const MAX_VISIBLE_DOWNLOADS = 20;

export interface BrowserDownloadStart {
  id: string;
  filename: string;
  sourceUrl: string;
  receivedBytes: number;
  totalBytes: number;
  startedAt: string;
}

/** Mutable main-process projection; values returned to Renderer are cloned. */
export class BrowserDownloadProjectionStore {
  readonly #records = new Map<string, BrowserDownloadView>();

  public start(input: BrowserDownloadStart): void {
    this.#records.set(input.id, {
      id: input.id,
      filename: safeFilename(input.filename),
      sourceOrigin: safeOrigin(input.sourceUrl),
      status: "progressing",
      receivedBytes: safeBytes(input.receivedBytes),
      totalBytes: safeBytes(input.totalBytes),
      startedAt: input.startedAt,
      updatedAt: input.startedAt,
    });
    this.#trim();
  }

  public update(
    id: string,
    status: BrowserDownloadStatus,
    receivedBytes: number,
    totalBytes: number,
    updatedAt: string,
  ): void {
    const record = this.#records.get(id);
    if (!record) return;
    this.#records.set(id, {
      ...record,
      status,
      receivedBytes: safeBytes(receivedBytes),
      totalBytes: safeBytes(totalBytes),
      updatedAt,
    });
  }

  public dismiss(id: string): boolean {
    return this.#records.delete(id);
  }

  public snapshot(): BrowserDownloadView[] {
    return [...this.#records.values()]
      .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
      .map((record) => ({ ...record }));
  }

  public clear(): void { this.#records.clear(); }

  #trim(): void {
    if (this.#records.size <= MAX_VISIBLE_DOWNLOADS) return;
    const oldestTerminal = [...this.#records.values()]
      .filter((record) => record.status !== "progressing")
      .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))[0];
    const fallback = this.#records.keys().next().value as string | undefined;
    this.#records.delete(oldestTerminal?.id ?? fallback ?? "");
  }
}

function safeFilename(value: string): string {
  const name = value.split(/[\\/]/u).at(-1) ?? "";
  return name.replace(/[\u0000-\u001f]/gu, "_").slice(0, 240) || "download";
}

function safeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function safeBytes(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

import type { DownloadItem, Event, Session } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

import type { BrowserDownloadResult } from "../../../browser/agent-control-types.js";
import { BrowserDownloadProjectionStore } from
  "../../../browser/browser-download-projection.js";
import type { BrowserDownloadView } from "../../shared/types.js";

const RECENT_MS = 30_000;

/** Tracks sanitized download outcomes; never exposes or registers an absolute path. */
export class BrowserDownloadTracker {
  #changeQueued = false;
  #disposed = false;
  readonly #projection = new BrowserDownloadProjectionStore();
  readonly #records: BrowserDownloadResult[] = [];
  readonly #reservedPaths = new Set<string>();
  readonly #onDownload = (_event: Event, item: DownloadItem): void => {
    const id = randomUUID();
    const savePath = this.#reserveSavePath(item.getFilename());
    const startedAt = new Date().toISOString();
    item.setSavePath(savePath);
    this.#projection.start({
      id,
      filename: item.getFilename(),
      sourceUrl: item.getURL(),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      startedAt,
    });
    this.#notify();
    const onUpdated = (_updatedEvent: Event, state: string): void => {
      this.#projection.update(
        id,
        state === "interrupted" ? "interrupted" : "progressing",
        item.getReceivedBytes(),
        item.getTotalBytes(),
        new Date().toISOString(),
      );
      this.#notify();
    };
    item.on("updated", onUpdated);
    item.once("done", (_doneEvent, state) => {
      item.removeListener("updated", onUpdated);
      this.#reservedPaths.delete(savePath);
      const status = state === "completed"
        ? "completed"
        : state === "cancelled" ? "cancelled" : "interrupted";
      const completedAt = new Date().toISOString();
      this.#records.push({
        filename: item.getFilename().slice(0, 300),
        sourceUrl: item.getURL().slice(0, 4096),
        status,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        completedAt,
      });
      if (this.#records.length > 20) this.#records.splice(0, this.#records.length - 20);
      this.#projection.update(
        id, status, item.getReceivedBytes(), item.getTotalBytes(), completedAt,
      );
      this.#notify();
    });
  };

  public constructor(
    private readonly session: Session,
    private readonly downloadRoot: string,
    private readonly changed: () => void = () => undefined,
  ) {
    mkdirSync(downloadRoot, { recursive: true });
    session.on("will-download", this.#onDownload);
  }

  public snapshot(): BrowserDownloadView[] { return this.#projection.snapshot(); }

  public dismiss(id: string): boolean {
    const dismissed = this.#projection.dismiss(id);
    if (dismissed) this.#notify();
    return dismissed;
  }

  public async waitFor(
    filenamePart: string,
    timeoutMs: number,
    signal?: AbortSignal,
    notBefore = Date.now() - RECENT_MS,
  ): Promise<BrowserDownloadResult> {
    const started = Date.now();
    while (Date.now() - started <= timeoutMs) {
      if (signal?.aborted) throw new Error("浏览器下载等待已取消");
      const found = [...this.#records].reverse().find((record) =>
        Date.parse(record.completedAt) >= notBefore &&
        (!filenamePart || record.filename.includes(filenamePart)),
      );
      if (found) return { ...found };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`等待浏览器下载超时（${timeoutMs}ms）`);
  }

  public dispose(): void {
    this.#disposed = true;
    this.session.removeListener("will-download", this.#onDownload);
    this.#records.length = 0;
    this.#projection.clear();
    this.#reservedPaths.clear();
  }

  #reserveSavePath(untrustedName: string): string {
    const safeName = basename(untrustedName)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
      .slice(0, 240) || "download";
    const initial = join(this.downloadRoot, safeName);
    if (!existsSync(initial) && !this.#reservedPaths.has(initial)) {
      this.#reservedPaths.add(initial);
      return initial;
    }
    const extension = extname(safeName);
    const stem = safeName.slice(0, safeName.length - extension.length);
    let suffix = 1;
    let candidate = join(this.downloadRoot, `${stem} (${suffix})${extension}`);
    while (existsSync(candidate) || this.#reservedPaths.has(candidate)) {
      suffix += 1;
      candidate = join(this.downloadRoot, `${stem} (${suffix})${extension}`);
    }
    this.#reservedPaths.add(candidate);
    return candidate;
  }

  #notify(): void {
    if (this.#changeQueued || this.#disposed) return;
    this.#changeQueued = true;
    queueMicrotask(() => {
      this.#changeQueued = false;
      if (!this.#disposed) this.changed();
    });
  }
}

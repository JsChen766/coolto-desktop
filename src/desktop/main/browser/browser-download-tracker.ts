import type { DownloadItem, Event, Session } from "electron";
import { existsSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";

import type { BrowserDownloadResult } from "../../../browser/agent-control-types.js";

const RECENT_MS = 30_000;

/** Tracks sanitized download outcomes; never exposes or registers an absolute path. */
export class BrowserDownloadTracker {
  readonly #records: BrowserDownloadResult[] = [];
  readonly #onDownload = (_event: Event, item: DownloadItem): void => {
    item.setSavePath(this.#savePath(item.getFilename()));
    item.once("done", (_doneEvent, state) => {
      const status = state === "completed"
        ? "completed"
        : state === "cancelled" ? "cancelled" : "interrupted";
      this.#records.push({
        filename: item.getFilename().slice(0, 300),
        sourceUrl: item.getURL().slice(0, 4096),
        status,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        completedAt: new Date().toISOString(),
      });
      if (this.#records.length > 20) this.#records.splice(0, this.#records.length - 20);
    });
  };

  public constructor(
    private readonly session: Session,
    private readonly downloadRoot: string,
  ) {
    mkdirSync(downloadRoot, { recursive: true });
    session.on("will-download", this.#onDownload);
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
    this.session.removeListener("will-download", this.#onDownload);
    this.#records.length = 0;
  }

  #savePath(untrustedName: string): string {
    const safeName = basename(untrustedName)
      .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
      .slice(0, 240) || "download";
    const initial = join(this.downloadRoot, safeName);
    if (!existsSync(initial)) return initial;
    const extension = extname(safeName);
    const stem = safeName.slice(0, safeName.length - extension.length);
    return join(this.downloadRoot, `${stem}-${Date.now()}${extension}`);
  }
}

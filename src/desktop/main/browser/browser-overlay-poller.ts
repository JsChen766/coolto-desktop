import type { WebContents } from "electron";

import type {
  BrowserFieldWriteRecord,
  FieldReviewDecision,
  ReviewOutcome,
} from "../../../browser/types.js";
import {
  injectOverlay,
  pollOverlay,
  removeOverlay,
  type OverlayPollSnapshot,
} from "./browser-overlay-injector.js";

const POLL_INTERVAL_MS = 300;

export interface OverlayCallbacks {
  onDecision(fillId: string, decision: FieldReviewDecision): void;
  onComplete(outcome: ReviewOutcome): void;
  onError(message: string): void;
}

/**
 * B4: 每 300ms 轮询 window.__coolto_review；发现单字段决策变化推 onDecision，
 * 发现 globalAction 推 onComplete。onComplete 后自动 remove Overlay 并停止轮询。
 * 页面 didFinishLoad/didStartNavigation 也会强制停止（页面已换，Overlay 失效）。
 */
export class BrowserOverlayPoller {
  #timer: ReturnType<typeof setInterval> | undefined;
  #contents: WebContents | undefined;
  #records: BrowserFieldWriteRecord[] = [];
  #previous: Record<string, FieldReviewDecision> = {};
  #callbacks: OverlayCallbacks | undefined;
  #busy = false;

  public isActive(): boolean {
    return this.#timer !== undefined;
  }

  public async start(
    contents: WebContents,
    records: BrowserFieldWriteRecord[],
    callbacks: OverlayCallbacks,
  ): Promise<void> {
    if (this.#timer) return;
    this.#contents = contents;
    this.#records = records;
    this.#callbacks = callbacks;
    this.#previous = {};
    for (const r of records) this.#previous[r.fillId] = "pending";
    try {
      await injectOverlay(contents, records);
    } catch (error: unknown) {
      callbacks.onError(errorMessage(error));
      return;
    }
    this.#timer = setInterval(() => void this.#tick(), POLL_INTERVAL_MS);
  }

  public async stop(reason: "complete" | "cancel"): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    const contents = this.#contents;
    this.#contents = undefined;
    this.#callbacks = undefined;
    this.#records = [];
    this.#previous = {};
    if (reason === "cancel" && contents && !contents.isDestroyed()) {
      try {
        await removeOverlay(contents);
      } catch {
        /* ignore, page may be gone */
      }
    }
  }

  async #tick(): Promise<void> {
    if (this.#busy || !this.#contents || !this.#callbacks) return;
    if (this.#contents.isDestroyed()) {
      await this.stop("cancel");
      return;
    }
    this.#busy = true;
    try {
      const snap = await pollOverlay(this.#contents);
      if (!snap) return;
      this.#emitDecisionChanges(snap);
      if (snap.globalAction) await this.#finalize(snap);
    } catch (error: unknown) {
      this.#callbacks?.onError(errorMessage(error));
    } finally {
      this.#busy = false;
    }
  }

  #emitDecisionChanges(snap: OverlayPollSnapshot): void {
    for (const id of Object.keys(snap.decisions)) {
      const next = snap.decisions[id] ?? "pending";
      if (next !== "pending" && next !== this.#previous[id]) {
        this.#previous[id] = next;
        if (next === "accepted" || next === "rejected") {
          this.#callbacks?.onDecision(id, next);
        }
      }
    }
  }

  async #finalize(snap: OverlayPollSnapshot): Promise<void> {
    const decisions = snap.decisions;
    let accepted = 0;
    let rejected = 0;
    for (const id of Object.keys(decisions)) {
      if (decisions[id] === "accepted") accepted += 1;
      else if (decisions[id] === "rejected") rejected += 1;
    }
    const action: ReviewOutcome["action"] =
      snap.globalAction === "reject_all"
        ? "rejected"
        : snap.globalAction === "accept_all" || accepted > 0 && rejected === 0
          ? "accepted"
          : rejected > 0 && accepted === 0
            ? "rejected"
            : "mixed";
    const outcome: ReviewOutcome = {
      action,
      acceptedCount: accepted,
      rejectedCount: rejected,
    };
    const callbacks = this.#callbacks;
    const contents = this.#contents;
    await this.stop("complete");
    if (contents && !contents.isDestroyed()) {
      try {
        await removeOverlay(contents);
      } catch {
        /* ignore */
      }
    }
    callbacks?.onComplete(outcome);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

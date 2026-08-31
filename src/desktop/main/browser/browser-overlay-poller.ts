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
  type BrowserOverlayPresentation,
  type OverlayPollSnapshot,
} from "./browser-overlay-injector.js";

const POLL_INTERVAL_MS = 300;

export interface OverlayCallbacks {
  onDecision(fillId: string, decision: FieldReviewDecision): void;
  onComplete(outcome: ReviewOutcome): void;
  onError(message: string): void;
}

/**
 * B4: 每 300ms 轮询 host isolated world；发现单字段决策变化推 onDecision，
 * 发现 globalAction 推 onComplete。onComplete 后自动 remove Overlay 并停止轮询。
 * 页面 didFinishLoad/didStartNavigation 也会强制停止（页面已换，Overlay 失效）。
 */
export class BrowserOverlayPoller {
  #timer: ReturnType<typeof setInterval> | undefined;
  #contents: WebContents | undefined;
  #previous: Record<string, FieldReviewDecision> = Object.create(null) as
    Record<string, FieldReviewDecision>;
  #callbacks: OverlayCallbacks | undefined;
  #cssKey: string | undefined;
  #busy = false;
  #session = 0;

  public isActive(): boolean {
    return this.#contents !== undefined;
  }

  public async start(
    contents: WebContents,
    records: BrowserFieldWriteRecord[],
    presentation: BrowserOverlayPresentation,
    callbacks: OverlayCallbacks,
  ): Promise<void> {
    if (this.#contents) return;
    const session = ++this.#session;
    this.#contents = contents;
    this.#callbacks = callbacks;
    this.#previous = Object.create(null) as Record<string, FieldReviewDecision>;
    for (const r of records) this.#previous[r.fillId] = "pending";
    let cssKey: string | undefined;
    try {
      let result = await injectOverlay(contents, records, presentation);
      cssKey = result.cssKey;
      if (result.alreadyInjected) {
        await removeOverlay(contents, cssKey);
        cssKey = undefined;
        result = await injectOverlay(contents, records, presentation);
        cssKey = result.cssKey;
      }
    } catch (error: unknown) {
      if (session !== this.#session) return;
      if (!contents.isDestroyed()) await safeRemove(contents, cssKey);
      if (session !== this.#session) return;
      this.#reset();
      callbacks.onError(errorMessage(error));
      return;
    }
    if (session !== this.#session || this.#contents !== contents) {
      if (!contents.isDestroyed()) await safeRemove(contents, cssKey);
      return;
    }
    this.#cssKey = cssKey;
    this.#timer = setInterval(() => void this.#tick(), POLL_INTERVAL_MS);
  }

  public async stop(reason: "complete" | "cancel"): Promise<void> {
    this.#session += 1;
    if (this.#timer) clearInterval(this.#timer);
    const contents = this.#contents;
    const cssKey = this.#cssKey;
    this.#reset();
    if (reason === "cancel" && contents && !contents.isDestroyed()) {
      await safeRemove(contents, cssKey);
    }
  }

  async #tick(): Promise<void> {
    if (this.#busy || !this.#contents || !this.#callbacks) return;
    const session = this.#session;
    if (this.#contents.isDestroyed()) {
      await this.stop("cancel");
      return;
    }
    this.#busy = true;
    try {
      const snap = await pollOverlay(this.#contents);
      if (session !== this.#session) return;
      if (!snap) throw new Error("overlay_state_unavailable");
      this.#emitDecisionChanges(snap);
      if (snap.globalAction) await this.#finalize(snap);
    } catch (error: unknown) {
      await this.#fail(session, errorMessage(error));
    } finally {
      this.#busy = false;
    }
  }

  #emitDecisionChanges(snap: OverlayPollSnapshot): void {
    for (const id of Object.keys(this.#previous)) {
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
    for (const id of Object.keys(this.#previous)) {
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
    const cssKey = this.#cssKey;
    await this.stop("complete");
    if (contents && !contents.isDestroyed()) {
      await safeRemove(contents, cssKey);
    }
    callbacks?.onComplete(outcome);
  }

  async #fail(session: number, message: string): Promise<void> {
    if (session !== this.#session) return;
    const callbacks = this.#callbacks;
    await this.stop("cancel");
    callbacks?.onError(message);
  }

  #reset(): void {
    this.#timer = undefined;
    this.#contents = undefined;
    this.#callbacks = undefined;
    this.#cssKey = undefined;
    this.#previous = Object.create(null) as Record<string, FieldReviewDecision>;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function safeRemove(contents: WebContents, cssKey?: string): Promise<void> {
  try {
    await removeOverlay(contents, cssKey);
  } catch {
    /* page may have navigated or been destroyed */
  }
}

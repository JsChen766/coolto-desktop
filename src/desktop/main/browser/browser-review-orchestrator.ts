import type { WebContents } from "electron";

import type {
  BrowserFieldWriteRecord,
  CaptchaDetection,
  FieldReviewDecision,
  ReviewOutcome,
} from "../../../browser/types.js";
import { BrowserCaptchaDetector } from "./browser-captcha-detector.js";
import { BrowserOverlayPoller } from "./browser-overlay-poller.js";
import type { BrowserPageOperatorImpl } from "./browser-page-operator.js";

export interface ReviewOrchestratorDeps {
  operator: BrowserPageOperatorImpl;
  activeWebContents: () => WebContents | undefined;
  emitFillProgress: (
    records: BrowserFieldWriteRecord[],
    reviewing: boolean,
  ) => void;
  emitReviewDecision: (fillId: string, decision: FieldReviewDecision) => void;
  emitReviewComplete: (outcome: ReviewOutcome) => void;
  emitCaptchaDetected: (detection: CaptchaDetection) => void;
}

/**
 * B4: 把 BrowserWindowManager 里跟审核/验证码相关的编排抽成协调器，
 * 避免 manager 类膨胀超过 250 行。这里只组合 Poller/Detector 与
 * BrowserPageOperatorImpl 的接口，不直接持有 BrowserWindow。
 */
export class BrowserReviewOrchestrator {
  readonly #overlay = new BrowserOverlayPoller();
  readonly #captcha = new BrowserCaptchaDetector();

  public constructor(private readonly deps: ReviewOrchestratorDeps) {}

  public dispose(): void {
    void this.#overlay.stop("cancel");
    this.#captcha.stop();
  }

  /** BrowserPageOperator.enterReview 触发；此处只做副作用。 */
  public async startReview(records: BrowserFieldWriteRecord[]): Promise<void> {
    const contents = this.deps.activeWebContents();
    if (!contents) throw new Error("无活跃标签，无法启动审核");
    this.deps.emitFillProgress(records, true);
    await this.#overlay.start(contents, records, {
      onDecision: (fillId, decision) =>
        this.deps.emitReviewDecision(fillId, decision),
      onComplete: (outcome) => {
        this.deps.operator.exitReview();
        this.deps.emitReviewComplete(outcome);
        this.deps.emitFillProgress([], false);
      },
      onError: (message) => {
        this.deps.operator.exitReview();
        this.deps.emitReviewComplete({
          action: "mixed",
          acceptedCount: 0,
          rejectedCount: 0,
        });
        this.deps.emitFillProgress([], false);
        console.warn("[browser-overlay] poller error:", message);
      },
    });
  }

  /**
   * B4: 用户点「中止填写」→ 已写入的字段不能绕过审核，强制进入 Overlay。
   * 若已在 reviewing 中直接忽略；无写入记录时也无事可做。
   */
  public abortFill(): void {
    if (this.#overlay.isActive()) return;
    if (this.deps.operator.getFillLog().length === 0) return;
    try {
      this.deps.operator.enterReview();
    } catch {
      /* ignore, 已 reviewing 或 fillLog 为空 */
    }
  }

  public startCaptchaProbe(): void {
    const contents = this.deps.activeWebContents();
    if (!contents) return;
    this.#captcha.start(contents, {
      onDetected: (detection) => this.deps.emitCaptchaDetected(detection),
    });
  }

  public stopCaptchaProbe(): void {
    this.#captcha.stop();
  }

  public stopOverlay(): void {
    void this.#overlay.stop("cancel");
  }
}

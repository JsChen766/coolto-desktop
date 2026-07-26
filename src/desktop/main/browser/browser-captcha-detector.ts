import type { WebContents } from "electron";

import type { CaptchaDetection } from "../../../browser/types.js";
import { probeCaptcha } from "./browser-captcha-probe.js";

const PROBE_INTERVAL_MS = 2000;

export interface CaptchaDetectorCallbacks {
  onDetected(detection: CaptchaDetection): void;
}

/**
 * B4: 写权限授予期间每 2s 探测一次页面上的验证码/滑块特征。
 * 同一 kind 不重复上抛（避免刷屏）；stop() 后清零状态。
 * 由 BrowserWindowManager 在 grant/revoke 时启停；页面导航（origin 变化）
 * 会触发 gate.revoke，进而由外部 stop。
 */
export class BrowserCaptchaDetector {
  #timer: ReturnType<typeof setInterval> | undefined;
  #contents: WebContents | undefined;
  #callbacks: CaptchaDetectorCallbacks | undefined;
  #lastKind: CaptchaDetection["kind"] | null = null;
  #busy = false;

  public isActive(): boolean {
    return this.#timer !== undefined;
  }

  public start(
    contents: WebContents,
    callbacks: CaptchaDetectorCallbacks,
  ): void {
    if (this.#timer) return;
    this.#contents = contents;
    this.#callbacks = callbacks;
    this.#lastKind = null;
    this.#timer = setInterval(() => void this.#tick(), PROBE_INTERVAL_MS);
  }

  public stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#contents = undefined;
    this.#callbacks = undefined;
    this.#lastKind = null;
  }

  async #tick(): Promise<void> {
    if (this.#busy || !this.#contents || !this.#callbacks) return;
    if (this.#contents.isDestroyed()) {
      this.stop();
      return;
    }
    this.#busy = true;
    try {
      const detection = await probeCaptcha(this.#contents);
      if (!detection) {
        this.#lastKind = null;
        return;
      }
      if (detection.kind === this.#lastKind) return;
      this.#lastKind = detection.kind;
      this.#callbacks.onDetected(detection);
    } catch {
      /* 页面切走/未就绪时 executeJavaScript 可能抛错，忽略等待下一轮 */
    } finally {
      this.#busy = false;
    }
  }
}

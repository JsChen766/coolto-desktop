import type { WriteAccessCheck } from "../../../browser/types.js";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * B3: 主进程写权限闸门。授予后绑定「授权时的活跃标签 id + origin + 空闲截止时间」；
 * 每次成功的写原语调用后 touch() 刷新 5min TTL。
 *
 * 行为矩阵：
 *  - 未授予 / 已被 revoke / 已过期  → isError（Agent 必须重新 request_write_access）
 *  - 授予 tab ≠ 当前活跃 tab       → isError（暂失效；用户切回原 tab 且 origin 未变即恢复）
 *  - 授予 tab 的 origin 已变       → 立刻 revoke，返回 isError
 *  - 授予 tab + origin 均匹配      → ok，随后 touch()
 */
export class BrowserWriteAccessGate {
  #granted = false;
  #tabId: string | null = null;
  #origin: string | null = null;
  #expiresAt = 0;
  #reason = "";
  #reviewing = false;

  public grant(
    reason: string,
    tabId: string | null,
    origin: string | null,
  ): void {
    this.#granted = true;
    this.#tabId = tabId;
    this.#origin = origin;
    this.#reason = reason;
    this.#expiresAt = Date.now() + IDLE_TIMEOUT_MS;
    this.#reviewing = false;
  }

  public revoke(_cause: string): void {
    this.#granted = false;
    this.#tabId = null;
    this.#origin = null;
    this.#expiresAt = 0;
    this.#reason = "";
    this.#reviewing = false;
  }

  public isGranted(): boolean {
    if (!this.#granted) return false;
    if (Date.now() > this.#expiresAt) {
      this.revoke("timeout");
      return false;
    }
    return true;
  }

  /**
   * B4: Overlay 审核阶段闸门。审核中任何新的写原语一律拒绝，
   * 避免 Agent 在用户还没决定时又继续改动页面。exitReview 由主进程
   * 在轮询到 globalAction 之后调用。
   */
  public setReviewing(reviewing: boolean): void {
    this.#reviewing = reviewing;
  }

  public isReviewing(): boolean {
    return this.#reviewing;
  }

  /** 主进程感知到标签导航到新 origin 时调用；若与授权 origin 不一致则硬收回。 */
  public onOriginChanged(tabId: string, origin: string | null): boolean {
    if (!this.#granted || this.#tabId !== tabId || this.#origin === origin) {
      return false;
    }
    this.revoke("origin-changed");
    return true;
  }

  /**
   * 每次写原语执行前调用；不 touch，通过后由调用方在成功执行后再 touch()。
   */
  public check(
    activeTabId: string | null,
    activeOrigin: string | null,
  ): WriteAccessCheck {
    if (!this.#granted) {
      return {
        ok: false,
        message: "写权限尚未授予。请先调用 request_write_access 请求授权。",
      };
    }
    if (this.#reviewing) {
      return {
        ok: false,
        message:
          "上一批写入正等待用户在页内 Overlay 上逐项审核，暂不接受新的写入。" +
          "请等待 browser:review-complete 事件后再决定下一步。",
      };
    }
    if (Date.now() > this.#expiresAt) {
      this.revoke("timeout");
      return {
        ok: false,
        message: "写权限已因 5 分钟无操作自动收回，请重新调用 request_write_access。",
      };
    }
    if (this.#tabId !== activeTabId) {
      return {
        ok: false,
        message:
          "当前活跃标签不是获得写权限的标签。请提示用户切回原授权标签后再重试；" +
          "5 分钟内切回且网站未变即恢复，无需重新审批。",
      };
    }
    if (this.#origin !== activeOrigin) {
      this.revoke("origin-changed");
      return {
        ok: false,
        message:
          "授权标签已跳转到新网站，写权限自动收回。若确实需要在新页面写入，" +
          "请重新调用 request_write_access。",
      };
    }
    return { ok: true };
  }

  public touch(): void {
    if (!this.#granted) return;
    this.#expiresAt = Date.now() + IDLE_TIMEOUT_MS;
  }

  public snapshot(): {
    granted: boolean;
    tabId: string | null;
    origin: string | null;
    reason: string;
    reviewing: boolean;
  } {
    return {
      granted: this.#granted,
      tabId: this.#tabId,
      origin: this.#origin,
      reason: this.#reason,
      reviewing: this.#reviewing,
    };
  }
}

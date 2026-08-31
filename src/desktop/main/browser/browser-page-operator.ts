import type { WebContents } from "electron";

import type {
  BrowserFieldWriteRecord,
  BrowserPageOperator,
  FileUploadOutcome,
  FormElementSummary,
  WriteAccessCheck,
} from "../../../browser/types.js";
import { evaluateClickTarget } from "./browser-click-guards.js";
import {
  fillPageField,
  performPageClick,
  readClickTargetHint,
  scrollPageToElement,
  selectPageOption,
  setPageChecked,
  tagPageElements,
} from "./browser-content-writer.js";
import { BrowserWriteAccessGate } from "./browser-write-access-gate.js";
import { uploadPageFile } from "./browser-page-file-upload.js";
import { BrowserFillLog } from "./browser-fill-log.js";
import { BrowserPageAccessState } from "./browser-page-access-state.js";

export interface ActiveTabContext {
  tabId: string;
  origin: string | null;
  webContents: WebContents;
}

export interface ActiveTabResolver {
  /** 返回当前活跃标签的执行上下文；无活跃标签或浏览器未打开时抛错。 */
  resolve(): ActiveTabContext;
}

export interface ReviewStarter {
  /** 由 BrowserWindowManager 提供：给定 fillLog 后注入 Overlay 并开启轮询。 */
  start(records: BrowserFieldWriteRecord[]): Promise<void>;
}

export interface WriteAccessLifecycle {
  onGranted(): void;
  onRevoked(): void;
}

/**
 * B5: 弹出系统文件选择框，返回用户选中的本地路径。用户取消返回空数组。
 * 抽成依赖便于测试，且把 Electron dialog 依赖挡在 operator 之外。
 */
export interface FilePicker {
  pick(options: { accept: string; multiple: boolean }): Promise<string[]>;
}

/**
 * B3+B4: BrowserPageOperator 的实现。所有写原语调用前先经 gate 校验；
 * 成功执行后 touch() 刷新 5min TTL。tagElements 也纳入闸门。
 * B4 追加：fill/select/setChecked 成功后写入 fillLog；enterReview 通过
 * reviewStarter 触发主进程侧的 Overlay 注入与轮询；exitReview 由 poller
 * onComplete 后调用，清空 fillLog 并解锁闸门 reviewing 位。
 */
export class BrowserPageOperatorImpl implements BrowserPageOperator {
  readonly #accessState: BrowserPageAccessState;
  readonly #fillLog = new BrowserFillLog();

  public constructor(
    private readonly gate: BrowserWriteAccessGate,
    private readonly activeTab: ActiveTabResolver,
    private readonly reviewStarter: ReviewStarter,
    private readonly lifecycle: WriteAccessLifecycle,
    private readonly filePicker: FilePicker,
  ) {
    this.#accessState = new BrowserPageAccessState(
      gate, () => this.#fillLog.clear(), lifecycle.onRevoked,
    );
  }

  public isWriteAccessGranted(): boolean {
    return this.#accessState.isGranted();
  }

  public subscribeState(listener: () => void): () => void {
    return this.#accessState.subscribe(listener);
  }

  public contextChanged(): void { this.#accessState.contextChanged(); }

  public grantWriteAccess(reason: string): void {
    try {
      const ctx = this.activeTab.resolve();
      this.gate.grant(reason, ctx.tabId, ctx.origin);
    } catch {
      // 若浏览器未打开或无活跃标签，仍标记为已授予但绑定 null 上下文；
      // 后续 check() 会因 tabId 不匹配而拒绝并给出明确提示。
      this.gate.grant(reason, null, null);
    }
    this.lifecycle.onGranted();
    this.#accessState.changed();
  }

  public revokeWriteAccess(cause: string): void {
    this.gate.revoke(cause);
    this.#fillLog.clear();
    this.lifecycle.onRevoked();
    this.#accessState.changed();
  }

  public checkWriteAccess(): WriteAccessCheck {
    try {
      const context = this.activeTab.resolve();
      return this.#accessState.check(context.tabId, context.origin);
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "浏览器未打开或无活跃标签",
      };
    }
  }

  public async tagElements(preferredText?: string): Promise<FormElementSummary[]> {
    const ctx = this.#requireGranted();
    const result = await tagPageElements(ctx.webContents, ctx.origin, preferredText);
    this.gate.touch();
    return result;
  }

  public async fillField(fillId: string, value: string): Promise<void> {
    const ctx = this.#requireGranted();
    const meta = await fillPageField(ctx.webContents, fillId, value);
    this.#fillLog.record(fillId, meta);
    this.gate.touch();
  }

  public async selectOption(fillId: string, value: string): Promise<void> {
    const ctx = this.#requireGranted();
    const meta = await selectPageOption(ctx.webContents, fillId, value);
    this.#fillLog.record(fillId, meta);
    this.gate.touch();
  }

  public async setChecked(fillId: string, checked: boolean): Promise<void> {
    const ctx = this.#requireGranted();
    const meta = await setPageChecked(ctx.webContents, fillId, checked);
    this.#fillLog.record(fillId, meta);
    this.gate.touch();
  }

  public async clickElement(fillId: string): Promise<void> {
    const ctx = this.#requireGranted();
    const hint = await readClickTargetHint(ctx.webContents, fillId);
    if (!hint) throw new Error("目标元素不存在（element_not_found）");
    const guard = evaluateClickTarget(hint, ctx.origin);
    if (!guard.allow) {
      throw new Error(
        guard.reason ??
          "该按钮疑似提交/发送控件，Agent 禁止点击；请让用户手动完成提交",
      );
    }
    await performPageClick(ctx.webContents, fillId);
    this.gate.touch();
  }

  public async scrollTo(fillId: string): Promise<void> {
    const ctx = this.#requireGranted();
    await scrollPageToElement(ctx.webContents, fillId);
    this.gate.touch();
  }

  public async uploadFile(fillId: string, registeredPaths?: readonly string[]):
  Promise<FileUploadOutcome> {
    const ctx = this.#requireGranted();
    return uploadPageFile(
      ctx.webContents, fillId, this.filePicker, () => this.gate.touch(),
      registeredPaths,
    );
  }

  public isReviewing(): boolean {
    return this.gate.isReviewing();
  }

  public getFillLog(): BrowserFieldWriteRecord[] {
    return this.#fillLog.list();
  }

  public enterReview(): void {
    if (!this.#fillLog.hasEntries) {
      throw new Error("fillLog 为空，无法进入审核阶段");
    }
    this.gate.setReviewing(true);
    this.#accessState.changed();
    const snapshot = this.#fillLog.list();
    void this.reviewStarter.start(snapshot).catch(() => {
      // 注入失败时回滚 reviewing 位，让 Agent 有机会重试。
      this.gate.setReviewing(false);
      this.#accessState.changed();
    });
  }

  public exitReview(): void {
    this.gate.setReviewing(false);
    this.#fillLog.clear();
    this.#accessState.changed();
  }

  #requireGranted(): ActiveTabContext {
    const ctx = this.activeTab.resolve();
    const check = this.#accessState.check(ctx.tabId, ctx.origin);
    if (!check.ok) throw new Error(check.message);
    return ctx;
  }

}

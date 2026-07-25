import type { WebContents } from "electron";

import type {
  BrowserPageOperator,
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

export interface ActiveTabContext {
  tabId: string;
  origin: string | null;
  webContents: WebContents;
}

export interface ActiveTabResolver {
  /** 返回当前活跃标签的执行上下文；无活跃标签或浏览器未打开时抛错。 */
  resolve(): ActiveTabContext;
}

/**
 * B3: BrowserPageOperator 的实现。所有写原语调用前先经 gate 校验；
 * 成功执行后 touch() 刷新 5min TTL。tagElements 也纳入闸门。
 */
export class BrowserPageOperatorImpl implements BrowserPageOperator {
  public constructor(
    private readonly gate: BrowserWriteAccessGate,
    private readonly activeTab: ActiveTabResolver,
  ) {}

  public isWriteAccessGranted(): boolean {
    return this.gate.isGranted();
  }

  public grantWriteAccess(reason: string): void {
    try {
      const ctx = this.activeTab.resolve();
      this.gate.grant(reason, ctx.tabId, ctx.origin);
    } catch {
      // 若浏览器未打开或无活跃标签，仍标记为已授予但绑定 null 上下文；
      // 后续 check() 会因 tabId 不匹配而拒绝并给出明确提示。
      this.gate.grant(reason, null, null);
    }
  }

  public revokeWriteAccess(cause: string): void {
    this.gate.revoke(cause);
  }

  public checkWriteAccess(): WriteAccessCheck {
    try {
      const ctx = this.activeTab.resolve();
      return this.gate.check(ctx.tabId, ctx.origin);
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error ? error.message : "浏览器未打开或无活跃标签",
      };
    }
  }

  public async tagElements(): Promise<FormElementSummary[]> {
    const ctx = this.#requireGranted();
    const result = await tagPageElements(ctx.webContents);
    this.gate.touch();
    return result;
  }

  public async fillField(fillId: string, value: string): Promise<void> {
    const ctx = this.#requireGranted();
    await fillPageField(ctx.webContents, fillId, value);
    this.gate.touch();
  }

  public async selectOption(fillId: string, value: string): Promise<void> {
    const ctx = this.#requireGranted();
    await selectPageOption(ctx.webContents, fillId, value);
    this.gate.touch();
  }

  public async setChecked(fillId: string, checked: boolean): Promise<void> {
    const ctx = this.#requireGranted();
    await setPageChecked(ctx.webContents, fillId, checked);
    this.gate.touch();
  }

  public async clickElement(fillId: string): Promise<void> {
    const ctx = this.#requireGranted();
    const hint = await readClickTargetHint(ctx.webContents, fillId);
    if (!hint) throw new Error("目标元素不存在（element_not_found）");
    const guard = evaluateClickTarget(hint);
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

  #requireGranted(): ActiveTabContext {
    const ctx = this.activeTab.resolve();
    const check = this.gate.check(ctx.tabId, ctx.origin);
    if (!check.ok) throw new Error(check.message);
    return ctx;
  }
}

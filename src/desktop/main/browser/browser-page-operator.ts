import type { WebContents } from "electron";
import type {
  BrowserFieldWriteRecord,
  BrowserPageOperator,
  FileUploadOutcome,
  FormElementSummary,
  WriteAccessCheck,
} from "../../../browser/types.js";
import { isRecruitingFormFixtureOrigin } from "../../../browser/recruiting-form-fixture-policy.js";
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
import { executeInSameOriginFrames } from "./browser-frame-execution.js";
import { BrowserWriteAccessGate } from "./browser-write-access-gate.js";
import { uploadFileInput } from "./browser-file-uploader.js";
import { BrowserFillLog } from "./browser-fill-log.js";
import { BrowserPageAccessState } from "./browser-page-access-state.js";
export interface ActiveTabContext {
  tabId: string;
  origin: string | null;
  webContents: WebContents;
}
export interface BrowserFrameSummary {
  sameOriginFrames: number;
  crossOriginFrames: number;
  openShadowRoots: number;
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
export interface FilePicker {
  pick(options: { accept: string; multiple: boolean }): Promise<string[]>;
}
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
    const valueBefore = await readExactFieldValue(ctx.webContents, fillId);
    const meta = await fillPageField(ctx.webContents, fillId, value);
    this.#fillLog.record(fillId, {
      ...meta, valueBefore: valueBefore ?? meta.valueBefore, valueAfter: value,
    });
    this.gate.touch();
  }

  public async selectOption(fillId: string, value: string): Promise<void> {
    const ctx = this.#requireGranted();
    const valueBefore = await readExactFieldValue(ctx.webContents, fillId);
    const meta = await selectPageOption(ctx.webContents, fillId, value);
    this.#fillLog.record(fillId, {
      ...meta, valueBefore: valueBefore ?? meta.valueBefore,
    });
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
    const outcome = await uploadFileInput(
      ctx.webContents, fillId, ctx.origin, this.filePicker, registeredPaths,
    );
    if (!outcome.cancelled && isRecruitingFormFixtureOrigin(ctx.origin)) {
      this.#fillLog.record(fillId, {
        elementType: "input", label: "文件附件", valueBefore: "",
        valueAfter: outcome.filenames.join("、"),
      });
    }
    return outcome;
  }
  /** Host-derived frame topology; page content never supplies this trust signal. */
  public async readFrameSummary(): Promise<BrowserFrameSummary> {
    const context = this.activeTab.resolve();
    const main = context.webContents.mainFrame;
    const expectedOrigin = context.origin;
    if (!main || main.isDestroyed() || main.detached || !expectedOrigin ||
        main.origin !== expectedOrigin) throw new Error("frame_topology_unavailable");
    const actualMainOrigin = await main.executeJavaScript("location.origin", true);
    if (actualMainOrigin !== expectedOrigin) throw new Error("frame_topology_unavailable");
    const children = main.framesInSubtree.filter((frame) => frame !== main);
    const processId = main.osProcessId;
    if (!Number.isSafeInteger(processId) || children.some((frame) =>
      frame.isDestroyed() || frame.detached ||
      !Number.isSafeInteger(frame.osProcessId) || frame.osProcessId !== processId,
    )) throw new Error("frame_topology_unavailable");
    for (const frame of children) {
      let actualOrigin: unknown;
      try { actualOrigin = await frame.executeJavaScript("location.origin", true); }
      catch { throw new Error("frame_topology_unavailable"); }
      if (actualOrigin !== frame.origin) throw new Error("frame_topology_unavailable");
    }
    const sameOrigin = children.filter((frame) => frame.origin === expectedOrigin);
    return {
      sameOriginFrames: sameOrigin.length,
      crossOriginFrames: children.length - sameOrigin.length,
      openShadowRoots: 0,
    };
  }
  public async readCheckableState(fillId: string): Promise<boolean | null> {
    const context = this.activeTab.resolve();
    const executions = await executeInSameOriginFrames<boolean | null>(
      context.webContents,
      `(() => { const el = Array.from(document.querySelectorAll('[data-fill-id]')).find((item) => item.getAttribute('data-fill-id') === ${JSON.stringify(fillId)}); return el && (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : null; })()`,
    );
    return executions.find((item) => typeof item.value === "boolean")?.value ?? null;
  }
  public async readLiveFieldValues(): Promise<Array<{ fillId: string; currentValue: string; valueHash: string; name: string }>> {
    const context = this.activeTab.resolve();
    const executions = await executeInSameOriginFrames<Array<{ fillId: string; name: string; value: string; valueLength: number }>>(
      context.webContents, `(() => Array.from(document.querySelectorAll('[data-fill-id]')).map((el) => { const value = (el.type === 'checkbox' || el.type === 'radio') ? (el.checked ? '选中' : '未选中') : 'value' in el ? String(el.value || '') : el.isContentEditable ? String(el.innerText || '') : ''; return { fillId: el.getAttribute('data-fill-id') || '', name: el.getAttribute('name') || '', value, valueLength: value.length }; }))()`,
    );
    const values = executions.flatMap((execution) => Array.isArray(execution.value) ? execution.value : []);
    return Promise.all(values.map(async (item) => { const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(item.value)); return { fillId: item.fillId, name: item.name, currentValue: item.value.slice(0, 500), valueHash: `${item.valueLength}:${Buffer.from(digest).toString("hex")}` }; }));
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
async function readExactFieldValue(contents: WebContents, fillId: string): Promise<string | null> {
  try { const executions = await executeInSameOriginFrames<string | null>(contents, `(() => { const el = Array.from(document.querySelectorAll('[data-fill-id]')).find((item) => item.getAttribute('data-fill-id') === ${JSON.stringify(fillId)}); return el && 'value' in el ? String(el.value || '') : el?.isContentEditable ? String(el.innerText || '') : null; })()`); return executions.find((item) => typeof item.value === "string")?.value ?? null; } catch { return null; }
}

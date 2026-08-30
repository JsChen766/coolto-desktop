import type { WebContents } from "electron";
import { BrowserWindow, dialog } from "electron";

/**
 * B5: 通过 Chrome DevTools Protocol 向原生 `<input type=file>` 注入本地文件路径。
 *
 * executeJavaScript 无法设置 file input 的 value（浏览器安全限制），只能靠 CDP
 * 的 DOM.setFileInputFiles。流程：
 *   1. debugger.attach('1.3')（若已被占用则报错，交由上层给出可读提示）
 *   2. Runtime.evaluate 用 data-fill-id 取得 file input 的 objectId，同时校验它
 *      确实是 <input type=file>，并读取 multiple / accept 属性
 *   3. DOM.setFileInputFiles({ objectId, files }) 注入路径
 *   4. 派发 input/change 事件，兼容监听变更的前端组件
 *   5. detach（无论成败）
 *
 * 只做「注入 + 结果规范化」，不做写权限闸门检查（闸门在 BrowserPageOperator 层）。
 */

export interface FileUploadResult {
  fileCount: number;
}

export interface FileInputProbe {
  ok: boolean;
  reason?: string;
  accept: string;
  multiple: boolean;
}

/**
 * 上传前先读取 file input 的 accept/multiple（executeJavaScript 即可，无需 CDP），
 * 用于配置系统文件选择框的过滤器与多选。非 file input 时返回 ok:false。
 */
export async function probeFileInput(
  contents: WebContents,
  fillId: string,
): Promise<FileInputProbe> {
  const raw = (await contents.executeJavaScript(
    `(() => {
      const el = document.querySelector('[data-fill-id="' + ${q(fillId)}.replace(/"/g, '') + '"]');
      if (!el) return { ok: false, reason: 'element_not_found', accept: '', multiple: false };
      if (el.tagName !== 'INPUT' || (el.getAttribute('type') || '').toLowerCase() !== 'file')
        return { ok: false, reason: 'not_file_input', accept: '', multiple: false };
      if (el.disabled) return { ok: false, reason: 'element_disabled', accept: '', multiple: false };
      return { ok: true, accept: (el.getAttribute('accept') || '').slice(0, 200), multiple: !!el.multiple };
    })()`,
    true,
  )) as Partial<FileInputProbe> | null;
  return {
    ok: Boolean(raw?.ok),
    ...(raw?.reason ? { reason: raw.reason } : {}),
    accept: String(raw?.accept ?? ""),
    multiple: Boolean(raw?.multiple),
  };
}

interface EvaluateResult {
  result?: {
    objectId?: string;
    value?: unknown;
    subtype?: string;
  };
  exceptionDetails?: { text?: string };
}

function q(value: string): string {
  return JSON.stringify(value);
}

/**
 * 把 file input 的 accept 属性转成 Electron dialog 的 filters。
 * accept 形如 ".pdf,.doc,image/*"；MIME 通配（image/*）无法映射到扩展名，
 * 忽略之，最后总附一个「所有文件」兜底项，避免过滤过严导致用户选不到文件。
 */
export function buildFileFilters(
  accept: string,
): { name: string; extensions: string[] }[] {
  const extensions = accept
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.startsWith("."))
    .map((token) => token.slice(1).toLowerCase())
    .filter(Boolean);
  const filters: { name: string; extensions: string[] }[] = [];
  if (extensions.length > 0) {
    filters.push({ name: "允许的文件", extensions: [...new Set(extensions)] });
  }
  filters.push({ name: "所有文件", extensions: ["*"] });
  return filters;
}

/**
 * 弹系统文件选择框，返回用户选中的绝对路径。取消返回空数组。
 * 单选模式即使系统返回多个也只取第一个。
 */
export async function pickLocalFiles(
  parent: BrowserWindow | undefined,
  options: { accept: string; multiple: boolean },
): Promise<string[]> {
  const filters = buildFileFilters(options.accept);
  const properties: Array<"openFile" | "multiSelections"> = ["openFile"];
  if (options.multiple) properties.push("multiSelections");
  const result = parent
    ? await dialog.showOpenDialog(parent, { properties, filters })
    : await dialog.showOpenDialog({ properties, filters });
  if (result.canceled) return [];
  return options.multiple ? result.filePaths : result.filePaths.slice(0, 1);
}

/** 定位 file input 并回传 objectId；非 file input 时抛可读错误。 */
function buildLocateExpression(fillId: string): string {
  return `(() => {
  const el = document.querySelector('[data-fill-id="' + ${q(fillId)}.replace(/"/g, '') + '"]');
  if (!el) return { error: 'element_not_found' };
  if (el.tagName !== 'INPUT' || (el.getAttribute('type') || '').toLowerCase() !== 'file')
    return { error: 'not_file_input' };
  if (el.disabled) return { error: 'element_disabled' };
  return el;
})()`;
}

/** 注入后派发 input/change，让 React/Vue 等监听器感知附件已选。 */
function buildDispatchExpression(fillId: string): string {
  return `(() => {
  const el = document.querySelector('[data-fill-id="' + ${q(fillId)}.replace(/"/g, '') + '"]');
  if (!el) return { error: 'element_not_found' };
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, fileCount: el.files ? el.files.length : 0 };
})()`;
}

function reasonFromError(code: unknown): string {
  switch (code) {
    case "element_not_found":
      return "目标元素不存在（element_not_found）";
    case "not_file_input":
      return "目标不是原生 <input type=file>，无法上传；请提示用户手动上传附件";
    case "element_disabled":
      return "目标文件输入框已禁用（element_disabled）";
    default:
      return typeof code === "string" ? code : "文件上传失败";
  }
}

/**
 * 对指定 file input（由 data-fill-id 定位）注入本地文件路径。
 * 上层已 probe 过合法性，这里专注 CDP 注入；任何阶段失败均抛错。
 */
export async function setFileInputFiles(
  contents: WebContents,
  fillId: string,
  filePaths: string[],
): Promise<FileUploadResult> {
  if (filePaths.length === 0) {
    throw new Error("未提供任何文件路径");
  }
  const dbg = contents.debugger;
  let attached = false;
  try {
    if (!dbg.isAttached()) dbg.attach("1.3");
    attached = true;
    await dbg.sendCommand("DOM.enable");
    await dbg.sendCommand("Runtime.enable");

    const located = (await dbg.sendCommand("Runtime.evaluate", {
      expression: buildLocateExpression(fillId),
      returnByValue: false,
    })) as EvaluateResult;
    if (located.exceptionDetails) {
      throw new Error(located.exceptionDetails.text ?? "定位文件输入框失败");
    }
    const objectId = located.result?.objectId;
    if (!objectId) {
      const err = (located.result?.value as { error?: string } | undefined)
        ?.error;
      throw new Error(err ? reasonFromError(err) : "无法获取文件输入框的 objectId");
    }

    await dbg.sendCommand("DOM.setFileInputFiles", { objectId, files: filePaths });

    const dispatched = (await dbg.sendCommand("Runtime.evaluate", {
      expression: buildDispatchExpression(fillId),
      returnByValue: true,
    })) as EvaluateResult;
    return { fileCount: readFileCount(dispatched, filePaths.length) };
  } finally {
    if (attached && dbg.isAttached()) {
      try {
        dbg.detach();
      } catch {
        // detach 失败不影响上传结果，忽略。
      }
    }
  }
}

function readFileCount(result: EvaluateResult, fallback: number): number {
  const value = result.result?.value as
    | { ok?: boolean; fileCount?: number; error?: string }
    | undefined;
  if (value?.error) throw new Error(reasonFromError(value.error));
  return typeof value?.fileCount === "number" ? value.fileCount : fallback;
}

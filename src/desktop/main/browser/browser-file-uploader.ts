import type { WebContents, WebFrameMain } from "electron";
import { BrowserWindow, dialog } from "electron";
import type { FileUploadOutcome } from "../../../browser/types.js";

/** Browser file injection is host-only; page scripts never receive a path. */
export interface FileUploadResult { fileCount: number; }
export interface FileInputProbe { ok: boolean; reason?: string; accept: string; multiple: boolean; }
type BrowserDebugger = WebContents["debugger"];
interface CdpNode {
  nodeId: number;
  nodeName?: string;
  attributes?: string[];
  children?: CdpNode[];
  contentDocument?: CdpNode;
  shadowRoots?: CdpNode[];
}
interface DomDocument { root?: CdpNode; }
interface EvaluateResult { result?: { objectId?: string; value?: unknown }; exceptionDetails?: { text?: string }; }
interface FilePicker { pick(options: { accept: string; multiple: boolean }): Promise<string[]>; }

export async function probeFileInput(
  contents: WebContents,
  fillId: string,
  expectedOrigin?: string | null,
): Promise<FileInputProbe> {
  return withDebugger(contents, async (debuggerHandle) => {
    const expected = expectedOrigin === undefined
      ? contents.mainFrame?.origin ?? null : expectedOrigin;
    if (!await frameTopologySafe(contents.mainFrame, expected)) {
      return { ok: false, reason: "frame_topology_unavailable", accept: "", multiple: false };
    }
    const node = await findFileNode(contents, debuggerHandle, fillId, expected);
    if (!node) return { ok: false, reason: "element_not_found", accept: "", multiple: false };
    const attrs = attributes(node);
    if ((node.nodeName ?? "").toUpperCase() !== "INPUT" || attrs.type?.toLowerCase() !== "file") {
      return { ok: false, reason: "not_file_input", accept: "", multiple: false };
    }
    if (attrs.disabled !== undefined) return { ok: false, reason: "element_disabled", accept: "", multiple: false };
    return { ok: true, accept: (attrs.accept ?? "").slice(0, 200), multiple: attrs.multiple !== undefined };
  });
}

export async function uploadFileInput(
  contents: WebContents,
  fillId: string,
  expectedOrigin: string | null,
  picker: FilePicker,
  registeredPaths?: readonly string[],
): Promise<FileUploadOutcome> {
  const probe = await probeFileInput(contents, fillId, expectedOrigin);
  if (!probe.ok) throw new Error(uploadReason(probe.reason));
  const paths = registeredPaths?.length ? [...registeredPaths] : await picker.pick({
    accept: probe.accept, multiple: probe.multiple,
  });
  if (paths.length === 0) return { cancelled: true };
  const result = await setFileInputFiles(contents, fillId, paths, expectedOrigin);
  return {
    cancelled: false,
    filenames: paths.map((path) => path.split(/[\\/]/u).pop() ?? path),
    fileCount: result.fileCount,
  };
}

export function buildFileFilters(accept: string): { name: string; extensions: string[] }[] {
  const extensions = accept.split(",").map((token) => token.trim()).filter((token) => token.startsWith("."))
    .map((token) => token.slice(1).toLowerCase()).filter(Boolean);
  const filters: { name: string; extensions: string[] }[] = [];
  if (extensions.length > 0) filters.push({ name: "允许的文件", extensions: [...new Set(extensions)] });
  filters.push({ name: "所有文件", extensions: ["*"] }); return filters;
}
export async function pickLocalFiles(parent: BrowserWindow | undefined, options: { accept: string; multiple: boolean }): Promise<string[]> {
  const properties: Array<"openFile" | "multiSelections"> = ["openFile"];
  if (options.multiple) properties.push("multiSelections");
  const result = parent ? await dialog.showOpenDialog(parent, { properties, filters: buildFileFilters(options.accept) })
    : await dialog.showOpenDialog({ properties, filters: buildFileFilters(options.accept) });
  if (result.canceled) return []; return options.multiple ? result.filePaths : result.filePaths.slice(0, 1);
}

export async function setFileInputFiles(
  contents: WebContents,
  fillId: string,
  filePaths: string[],
  expectedOrigin?: string | null,
): Promise<FileUploadResult> {
  if (filePaths.length === 0) throw new Error("未提供任何文件路径");
  return withDebugger(contents, async (debuggerHandle) => {
    const expected = expectedOrigin === undefined
      ? contents.mainFrame?.origin ?? null : expectedOrigin;
    if (!await frameTopologySafe(contents.mainFrame, expected)) {
      throw new Error("frame_topology_unavailable");
    }
    const node = await findFileNode(contents, debuggerHandle, fillId, expected);
    if (!node) throw new Error("目标元素不存在（element_not_found）");
    const attrs = attributes(node);
    if ((node.nodeName ?? "").toUpperCase() !== "INPUT" || attrs.type?.toLowerCase() !== "file") {
      throw new Error("目标不是原生 <input type=file>");
    }
    if (attrs.disabled !== undefined) throw new Error("目标文件输入框已禁用（element_disabled）");
    if (!await frameTopologySafe(contents.mainFrame, expected)) {
      throw new Error("frame_topology_changed");
    }
    await debuggerHandle.sendCommand("DOM.setFileInputFiles", { nodeId: node.nodeId, files: filePaths });
    const resolved = await debuggerHandle.sendCommand("DOM.resolveNode", { nodeId: node.nodeId }) as { object?: { objectId?: string } };
    const objectId = resolved.object?.objectId;
    if (!objectId) throw new Error("无法获取文件输入框的 objectId");
    const dispatched = await debuggerHandle.sendCommand("Runtime.callFunctionOn", {
      objectId, returnByValue: true, functionDeclaration: "function () { this.dispatchEvent(new Event('input', { bubbles: true })); this.dispatchEvent(new Event('change', { bubbles: true })); return { ok: true, fileCount: this.files ? this.files.length : 0 }; }",
    }) as EvaluateResult;
    return { fileCount: readFileCount(dispatched, filePaths.length) };
  });
}

async function findFileNode(
  contents: WebContents,
  debuggerHandle: BrowserDebugger,
  fillId: string,
  expectedOrigin: string | null,
): Promise<CdpNode | null> {
  if (!await frameTopologySafe(contents.mainFrame, expectedOrigin)) return null;
  const document = await debuggerHandle.sendCommand("DOM.getDocument", { depth: -1, pierce: true }) as DomDocument;
  return document.root ? findNode(document.root, fillId, expectedOrigin) : null;
}
function findNode(node: CdpNode, fillId: string, documentOrigin: string | null): CdpNode | null {
  if (attributes(node)["data-fill-id"] === fillId) return node;
  for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
    const found = findNode(child, fillId, documentOrigin); if (found) return found;
  }
  if (node.contentDocument && sameOriginFrame(node, documentOrigin)) {
    return findNode(node.contentDocument, fillId, documentOrigin);
  }
  return null;
}
function sameOriginFrame(node: CdpNode, origin: string | null): boolean {
  if (!origin) return false;
  const src = attributes(node).src;
  if (!src || src === "about:blank" || src === "about:srcdoc") return true;
  try { return new URL(src, origin).origin === origin; } catch { return false; }
}
async function frameTopologySafe(
  main: WebFrameMain | null | undefined,
  expectedOrigin: string | null,
): Promise<boolean> {
  try {
    if (!main || !expectedOrigin || main.isDestroyed() || main.detached ||
        main.origin !== expectedOrigin) return false;
    const frames = main.framesInSubtree;
    const processId = main.osProcessId;
    if (!Number.isSafeInteger(processId) || !frames.includes(main)) return false;
    const actualMainOrigin = await main.executeJavaScript("location.origin", true);
    if (actualMainOrigin !== expectedOrigin) return false;
    for (const frame of frames) {
      if (frame.isDestroyed() || frame.detached ||
          !Number.isSafeInteger(frame.osProcessId) ||
          frame.osProcessId !== processId) return false;
      const actualOrigin = await frame.executeJavaScript("location.origin", true);
      if (actualOrigin !== expectedOrigin || actualOrigin !== frame.origin) return false;
    }
    return true;
  } catch {
    return false;
  }
}
function attributes(node: CdpNode): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index + 1 < (node.attributes?.length ?? 0); index += 2) {
    const name = node.attributes![index]; const value = node.attributes![index + 1];
    if (name && value !== undefined) result[name] = value;
  }
  return result;
}
async function withDebugger<T>(contents: WebContents, operation: (debuggerHandle: BrowserDebugger) => Promise<T>): Promise<T> {
  const debuggerHandle = contents.debugger; const owned = !debuggerHandle.isAttached();
  if (owned) debuggerHandle.attach("1.3");
  try {
    await debuggerHandle.sendCommand("DOM.enable"); await debuggerHandle.sendCommand("Runtime.enable");
    return await operation(debuggerHandle);
  } finally {
    if (owned && debuggerHandle.isAttached()) {
      try { debuggerHandle.detach(); } catch { /* best effort */ }
    }
  }
}
function uploadReason(reason: string | undefined): string {
  if (reason === "element_not_found") return "目标元素不存在（element_not_found）";
  if (reason === "not_file_input") return "目标不是原生 <input type=file>，无法上传；请提示用户手动上传附件";
  if (reason === "element_disabled") return "目标文件输入框已禁用（element_disabled）";
  return reason ?? "文件上传失败";
}
function readFileCount(result: EvaluateResult, fallback: number): number {
  const value = result.result?.value;
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") throw new Error(value.error);
  if (value && typeof value === "object" && "fileCount" in value && typeof value.fileCount === "number") return value.fileCount;
  return fallback;
}

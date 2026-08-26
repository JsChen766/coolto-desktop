import type { WebContents } from "electron";

import type { BrowserWaitRequest } from "../../../browser/agent-control-types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const POLL_MS = 100;

export async function waitForBrowserCondition(
  contents: WebContents,
  request: BrowserWaitRequest,
  signal?: AbortSignal,
): Promise<number> {
  const timeout = Math.min(
    MAX_TIMEOUT_MS,
    Math.max(POLL_MS, request.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  );
  const value = request.value?.trim() ?? "";
  if (["url", "text", "element"].includes(request.kind) && !value) {
    throw new Error(`${request.kind} 等待条件必须提供 value`);
  }
  const started = Date.now();
  let idleSince: number | undefined;
  while (Date.now() - started <= timeout) {
    if (signal?.aborted) throw new Error("浏览器等待已取消");
    if (contents.isDestroyed()) throw new Error("等待期间浏览器标签页已关闭");
    const matched = await matches(contents, request, value);
    if (request.kind === "network_idle") {
      idleSince = matched ? idleSince ?? Date.now() : undefined;
      if (idleSince && Date.now() - idleSince >= 500) return Date.now() - started;
    } else if (matched) {
      return Date.now() - started;
    }
    await delay(POLL_MS, signal);
  }
  throw new Error(`等待浏览器条件超时（${timeout}ms）`);
}

async function matches(
  contents: WebContents,
  request: BrowserWaitRequest,
  value: string,
): Promise<boolean> {
  if (request.kind === "load" || request.kind === "network_idle") {
    return !contents.isLoading() && !contents.isLoadingMainFrame();
  }
  if (request.kind === "url") return contents.getURL().includes(value);
  return Boolean(await contents.executeJavaScript(conditionScript(request, value), true));
}

function conditionScript(request: BrowserWaitRequest, value: string): string {
  const expected = JSON.stringify(value);
  if (request.kind === "text") {
    return `(() => String(document.body?.innerText || '').includes(${expected}))()`;
  }
  return `(() => { try { return !!document.querySelector(${expected}); } catch { return false; } })()`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("浏览器等待已取消"));
    }, { once: true });
  });
}

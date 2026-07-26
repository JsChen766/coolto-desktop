import type { WebContents } from "electron";

import type { BrowserFieldWriteRecord } from "../../../browser/types.js";
import {
  buildOverlayInjectScript,
  buildOverlayPollScript,
  buildOverlayRemoveScript,
} from "./browser-overlay-scripts.js";

/**
 * B4: Overlay 注入/轮询/清理的主进程封装。只做 executeJavaScript 调用与
 * 结果规范化；轮询节奏与状态机由 BrowserOverlayPoller 编排。
 */

export interface OverlayPollSnapshot {
  decisions: Record<string, "pending" | "accepted" | "rejected">;
  globalAction: "accept_all" | "reject_all" | "auto" | null;
}

export async function injectOverlay(
  contents: WebContents,
  records: BrowserFieldWriteRecord[],
): Promise<{ injectedCount: number; alreadyInjected: boolean }> {
  const result = (await contents.executeJavaScript(
    buildOverlayInjectScript(records),
    true,
  )) as
    | { ok: boolean; injectedCount?: number; alreadyInjected?: boolean }
    | undefined;
  return {
    injectedCount: result?.injectedCount ?? 0,
    alreadyInjected: Boolean(result?.alreadyInjected),
  };
}

export async function pollOverlay(
  contents: WebContents,
): Promise<OverlayPollSnapshot | null> {
  const raw = (await contents.executeJavaScript(
    buildOverlayPollScript(),
    true,
  )) as OverlayPollSnapshot | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  return {
    decisions: raw.decisions ?? {},
    globalAction: raw.globalAction ?? null,
  };
}

export async function removeOverlay(contents: WebContents): Promise<void> {
  await contents.executeJavaScript(buildOverlayRemoveScript(), true);
}

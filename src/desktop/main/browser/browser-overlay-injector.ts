import type { WebContents } from "electron";

import type { BrowserFieldWriteRecord } from "../../../browser/types.js";
import type { BrowserLocale } from "../../shared/types.js";
import {
  buildOverlayCss,
  buildOverlayInjectScript,
  buildOverlayPollScript,
  buildOverlayRemoveScript,
} from "./browser-overlay-scripts.js";
import type { BrowserOverlayTheme } from "./browser-overlay-styles.js";

export const BROWSER_OVERLAY_WORLD_ID = 1001;

export interface BrowserOverlayPresentation {
  locale: BrowserLocale;
  theme: BrowserOverlayTheme;
}

export interface OverlayPollSnapshot {
  decisions: Record<string, "pending" | "accepted" | "rejected">;
  globalAction: "accept_all" | "reject_all" | "auto" | null;
}

export interface OverlayInjection {
  injectedCount: number;
  alreadyInjected: boolean;
  cssKey: string;
}

export async function injectOverlay(
  contents: WebContents,
  records: BrowserFieldWriteRecord[],
  presentation: BrowserOverlayPresentation,
): Promise<OverlayInjection> {
  let cssKey: string | undefined;
  try {
    cssKey = await contents.insertCSS(buildOverlayCss(presentation.theme), {
      cssOrigin: "author",
    });
    const result = (await executeOverlayScript(
      contents,
      buildOverlayInjectScript(records, presentation.locale),
    )) as {
      ok?: boolean;
      reason?: string;
      injectedCount?: number;
      alreadyInjected?: boolean;
    } | undefined;
    if (!result?.ok) {
      throw new Error(result?.reason ?? "overlay_injection_failed");
    }
    return {
      injectedCount: result.injectedCount ?? 0,
      alreadyInjected: Boolean(result.alreadyInjected),
      cssKey,
    };
  } catch (error: unknown) {
    await cleanupOverlayArtifacts(contents, cssKey);
    throw error;
  }
}

export async function pollOverlay(
  contents: WebContents,
): Promise<OverlayPollSnapshot | null> {
  const raw = (await executeOverlayScript(
    contents,
    buildOverlayPollScript(),
  )) as { decisions?: unknown; globalAction?: unknown } | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const decisions: OverlayPollSnapshot["decisions"] = Object.create(null) as
    OverlayPollSnapshot["decisions"];
  if (raw.decisions && typeof raw.decisions === "object"
    && !Array.isArray(raw.decisions)) {
    for (const [fillId, decision] of Object.entries(raw.decisions)) {
      if (decision === "pending" || decision === "accepted"
        || decision === "rejected") decisions[fillId] = decision;
    }
  }
  const action = raw.globalAction;
  return {
    decisions,
    globalAction: action === "accept_all" || action === "reject_all"
      || action === "auto" ? action : null,
  };
}

export async function removeOverlay(
  contents: WebContents,
  cssKey?: string,
): Promise<void> {
  try {
    await executeOverlayScript(contents, buildOverlayRemoveScript());
  } finally {
    if (cssKey) await contents.removeInsertedCSS(cssKey);
  }
}

async function executeOverlayScript(
  contents: WebContents,
  code: string,
): Promise<unknown> {
  return contents.executeJavaScriptInIsolatedWorld(
    BROWSER_OVERLAY_WORLD_ID,
    [{ code }],
    false,
  );
}

async function cleanupOverlayArtifacts(
  contents: WebContents,
  cssKey?: string,
): Promise<void> {
  try { await executeOverlayScript(contents, buildOverlayRemoveScript()); } catch { /* gone */ }
  if (!cssKey) return;
  try { await contents.removeInsertedCSS(cssKey); } catch { /* gone */ }
}

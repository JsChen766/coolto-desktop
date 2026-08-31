import type { WebContents } from "electron";

import type {
  BrowserObservation,
  BrowserScreenshot,
} from "../../../browser/agent-control-types.js";
import type { PageSnapshot } from "../../../browser/types.js";
import { readAccessibilityTree } from "./browser-accessibility-reader.js";
import { probeCaptcha } from "./browser-captcha-probe.js";

const MAX_SCREENSHOT_WIDTH = 1280;
const MAX_SCREENSHOT_HEIGHT = 960;

export async function readBrowserObservation(input: {
  contents: WebContents;
  tab: BrowserObservation["tab"];
  page: () => Promise<PageSnapshot>;
  includeScreenshot: boolean;
}): Promise<BrowserObservation> {
  const captcha = input.includeScreenshot
    ? await probeCaptcha(input.contents)
    : null;
  const [page, accessibility] = await Promise.all([
    input.page(),
    readAccessibilityTree(input.contents),
  ]);
  const screenshot = input.includeScreenshot && !captcha
    ? await captureScreenshot(input.contents)
    : undefined;
  return {
    tab: input.tab,
    page,
    accessibility: accessibility.nodes,
    accessibilityTruncated: accessibility.truncated,
    ...(screenshot ? { screenshot } : {}),
    ...(captcha ? { screenshotBlockedReason: "captcha_detected" as const } : {}),
  };
}

async function captureScreenshot(
  contents: WebContents,
): Promise<BrowserScreenshot> {
  const cssKey = await contents.insertCSS(`
    input[type="password"], input[autocomplete="one-time-code"],
    input[name*="otp" i], input[id*="otp" i] {
      color: transparent !important; text-shadow: none !important;
      background: #111 !important; caret-color: transparent !important;
    }
  `);
  const debug = contents.debugger;
  const owned = !debug.isAttached();
  if (owned) debug.attach("1.3");
  try {
    const metrics = await debug.sendCommand("Page.getLayoutMetrics") as {
      cssVisualViewport?: { clientHeight?: number; clientWidth?: number };
    };
    const width = Math.max(1, metrics.cssVisualViewport?.clientWidth ?? 1);
    const height = Math.max(1, metrics.cssVisualViewport?.clientHeight ?? 1);
    const scale = Math.min(
      1,
      MAX_SCREENSHOT_WIDTH / width,
      MAX_SCREENSHOT_HEIGHT / height,
    );
    const captured = await debug.sendCommand("Page.captureScreenshot", {
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width, height, scale },
      format: "png",
      fromSurface: true,
    }) as { data?: string };
    if (!captured.data) throw new Error("浏览器截图返回空数据");
    return {
      data: captured.data,
      mimeType: "image/png",
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  } finally {
    await contents.removeInsertedCSS(cssKey).catch(() => {});
    if (owned && debug.isAttached()) debug.detach();
  }
}

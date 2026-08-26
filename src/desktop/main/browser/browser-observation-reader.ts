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
  const [page, accessibility, screenshot] = await Promise.all([
    input.page(),
    readAccessibilityTree(input.contents),
    input.includeScreenshot && !captcha
      ? captureScreenshot(input.contents)
      : Promise.resolve(undefined),
  ]);
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
  const captured = await contents.capturePage().finally(async () => {
    await contents.removeInsertedCSS(cssKey).catch(() => {});
  });
  const size = captured.getSize();
  const scale = Math.min(
    1,
    MAX_SCREENSHOT_WIDTH / Math.max(1, size.width),
    MAX_SCREENSHOT_HEIGHT / Math.max(1, size.height),
  );
  const image = scale < 1
    ? captured.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale)),
        quality: "good",
      })
    : captured;
  const finalSize = image.getSize();
  return {
    data: image.toPNG().toString("base64"),
    mimeType: "image/png",
    width: finalSize.width,
    height: finalSize.height,
  };
}

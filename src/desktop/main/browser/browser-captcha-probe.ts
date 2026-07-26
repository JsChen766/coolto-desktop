import type { WebContents } from "electron";

import type { CaptchaDetection } from "../../../browser/types.js";
import { buildCaptchaProbeScript } from "./browser-captcha-scripts.js";

/**
 * B4: 验证码探针的主进程封装。轮询由 BrowserCaptchaDetector 负责。
 */
export async function probeCaptcha(
  contents: WebContents,
): Promise<CaptchaDetection | null> {
  const raw = (await contents.executeJavaScript(
    buildCaptchaProbeScript(),
    true,
  )) as { kind?: unknown; detail?: unknown } | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  const kind = normalizeKind(String(raw.kind ?? ""));
  const detail = typeof raw.detail === "string" ? raw.detail : undefined;
  return detail !== undefined ? { kind, detail } : { kind };
}

function normalizeKind(value: string): CaptchaDetection["kind"] {
  switch (value) {
    case "recaptcha":
    case "hcaptcha":
    case "geetest":
    case "slider":
    case "image":
      return value;
    default:
      return "unknown";
  }
}

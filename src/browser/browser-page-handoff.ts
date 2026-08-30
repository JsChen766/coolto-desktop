import type { BrowserPageHandoffView } from
  "../desktop/shared/types/browser.js";

const SENSITIVE_PARAM = /^(?:access[_-]?token|api[_-]?key|auth|code|id[_-]?token|jwt|otp|password|refresh[_-]?token|secret|session|signature|token)$/iu;

export function browserPageHandoff(input: {
  title: string;
  url: string | null;
}): BrowserPageHandoffView | null {
  if (!input.url) return null;
  try {
    const url = new URL(input.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    for (const key of new Set(url.searchParams.keys())) {
      if (SENSITIVE_PARAM.test(key)) url.searchParams.delete(key);
    }
    if (hashContainsSecret(url.hash)) url.hash = "";
    return {
      title: cleanTitle(input.title),
      url: url.toString().slice(0, 2_048),
    };
  } catch {
    return null;
  }
}

function hashContainsSecret(hash: string): boolean {
  const source = hash.startsWith("#") ? hash.slice(1) : hash;
  return source.split(/[&;]/u).some((entry) => {
    const key = entry.split("=", 1)[0] ?? "";
    return SENSITIVE_PARAM.test(decodeURIComponentSafe(key));
  });
}

function decodeURIComponentSafe(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

function cleanTitle(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim().slice(0, 160)
    || "当前页面";
}

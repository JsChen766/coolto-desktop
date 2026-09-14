import type { BrowserPageHandoffView } from
  "../desktop/shared/types/browser.js";

export interface BrowserAgentTaskNavigationRequest {
  sequence: number;
  taskId: string;
}

export interface BrowserPageHandoffNavigationRequest {
  page: BrowserPageHandoffView;
  sequence: number;
}

export function nextBrowserAgentTaskNavigation(
  previous: BrowserAgentTaskNavigationRequest | undefined,
  taskId: unknown,
): BrowserAgentTaskNavigationRequest | null {
  if (typeof taskId !== "string" || taskId.length === 0 || taskId.length > 128 ||
      /[\u0000-\u001f\u007f]/u.test(taskId)) return null;
  return { sequence: (previous?.sequence ?? 0) + 1, taskId };
}

export function nextBrowserPageHandoffNavigation(
  previous: BrowserPageHandoffNavigationRequest | undefined,
  page: unknown,
): BrowserPageHandoffNavigationRequest | null {
  if (!page || typeof page !== "object") return null;
  const value = page as Partial<BrowserPageHandoffView>;
  if (typeof value.title !== "string" || typeof value.url !== "string" ||
      value.title.length === 0 || value.title.length > 160 || value.url.length > 2_048 ||
      !/^https?:\/\//u.test(value.url)) return null;
  const intent = value.intent === "analyze_jd" ? "analyze_jd" as const : undefined;
  return {
    page: { title: value.title, url: value.url, ...(intent ? { intent } : {}) },
    sequence: (previous?.sequence ?? 0) + 1,
  };
}

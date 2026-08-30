import type { BrowserAgentController } from "../browser/agent-control-types.js";
import type { JsonValue } from "./json-types.js";

export function managedTaskTargetContext(
  browser: BrowserAgentController,
  toolName: string,
  args: unknown,
): { tabId: string | null; url: string | null; origin: string | null } {
  const usesBrowser = toolName.startsWith("browser_") || [
    "extract_page", "request_write_access", "prepare_application_submission",
    "capture_browser_mail_event",
  ].includes(toolName);
  if (!usesBrowser) return { tabId: null, url: null, origin: null };
  const active = browser.getActiveTab();
  const requestedUrl = ["browser_navigate", "browser_new_tab", "browser_download"]
    .includes(toolName) && stringField(args, "url");
  const requestedTabId = ["browser_select_tab", "browser_close_tab"]
    .includes(toolName) && stringField(args, "tabId");
  const requestedTab = requestedTabId
    ? browser.listTabs().find((tab) => tab.id === requestedTabId) ?? null
    : null;
  const targetUrl = requestedUrl || requestedTab?.url ||
    (requestedTabId ? null : active?.url ?? null);
  let origin: string | null = null;
  try { origin = targetUrl ? new URL(targetUrl).origin : null; } catch { /* invalid */ }
  const tabId = toolName === "browser_new_tab"
    ? null : requestedTabId || active?.id || null;
  const observationUrl = requestedTabId ? requestedTab?.url ?? null : active?.url ?? null;
  return { tabId, url: observationUrl, origin };
}

export function managedTaskActiveContext(
  browser: BrowserAgentController,
  tabId: string | null | undefined = undefined,
): { tabId: string | null; url: string | null; origin: string | null } {
  const active = browser.getActiveTab();
  const url = active?.url ?? null;
  let origin: string | null = null;
  try { origin = url ? new URL(url).origin : null; } catch { /* invalid */ }
  return { tabId: tabId === undefined ? active?.id ?? null : tabId, url, origin };
}

export function toManagedTaskJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as JsonValue;
}

function stringField(value: unknown, field: string): string | null {
  if (!value || typeof value !== "object") return null;
  const fieldValue = (value as Record<string, unknown>)[field];
  return typeof fieldValue === "string" ? fieldValue : null;
}

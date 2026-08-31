import type { IpcMain, IpcMainInvokeEvent, WebContents } from "electron";

import {
  normalizeBrowserNavigationUrl,
} from "../../../browser/browser-navigation-url.js";
import type {
  BrowserLocale,
  BrowserOpenInput,
} from "../../shared/types.js";
import { BROWSER_IPC_CHANNELS } from "./browser-ipc-channels.js";
import type { BrowserWindowManager } from "./browser-window-manager.js";

export function registerBrowserMainIpc(
  ipcMain: IpcMain,
  mainContents: WebContents,
  manager: BrowserWindowManager,
): void {
  const C = BROWSER_IPC_CHANNELS;
  ipcMain.handle(C.open, (event, input: unknown) => {
    requireMainSender(event, mainContents);
    return manager.open(parseOpenInput(input));
  });
  ipcMain.handle(C.close, (event) => {
    requireMainSender(event, mainContents);
    return manager.close();
  });
  ipcMain.handle(C.navigate, (event, input: unknown) => {
    requireMainSender(event, mainContents);
    return manager.navigate(parseNavigateUrl(input));
  });
  ipcMain.handle(C.goBack, (event) => {
    requireMainSender(event, mainContents);
    return manager.goBack();
  });
  ipcMain.handle(C.goForward, (event) => {
    requireMainSender(event, mainContents);
    return manager.goForward();
  });
  ipcMain.handle(C.reload, (event) => {
    requireMainSender(event, mainContents);
    return manager.reload();
  });
  ipcMain.handle(C.getState, (event) => {
    requireMainSender(event, mainContents);
    return manager.getState();
  });
  ipcMain.handle(C.abortFill, (event) => {
    requireMainSender(event, mainContents);
    return manager.abortFill();
  });
}

function requireMainSender(
  event: IpcMainInvokeEvent,
  mainContents: WebContents,
): void {
  if (event.sender !== mainContents) throw new Error("Unauthorized browser IPC sender");
}

function parseOpenInput(value: unknown): BrowserOpenInput | undefined {
  if (value === undefined) return undefined;
  const record = requireRecord(value, "browser open input");
  requireKnownKeys(record, new Set(["url", "theme", "locale"]));
  const input: BrowserOpenInput = {};
  if (record.url !== undefined) {
    const url = normalizeBrowserNavigationUrl(record.url);
    if (!url) throw new Error("Invalid browser open URL");
    input.url = url;
  }
  if (record.theme !== undefined) {
    if (record.theme !== "light" && record.theme !== "dark") {
      throw new Error("Invalid browser theme");
    }
    input.theme = record.theme;
  }
  if (record.locale !== undefined) input.locale = browserLocale(record.locale);
  return input;
}

function parseNavigateUrl(value: unknown): string {
  const record = requireRecord(value, "browser navigation input");
  requireKnownKeys(record, new Set(["url"]));
  const url = normalizeBrowserNavigationUrl(record.url);
  if (!url) throw new Error("Invalid browser navigation URL");
  return url;
}

function browserLocale(value: unknown): BrowserLocale {
  if (value === "zh-CN" || value === "en-US") return value;
  throw new Error("Invalid browser locale");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid ${label}`);
  }
  return value as Record<string, unknown>;
}

function requireKnownKeys(record: Record<string, unknown>, allowed: Set<string>): void {
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new Error("Unknown browser IPC field");
  }
}

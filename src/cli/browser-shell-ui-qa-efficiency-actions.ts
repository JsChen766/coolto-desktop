import { BrowserWindow, type WebContents } from "electron";

import type { BrowserTab } from "../desktop/main/browser/browser-tab.js";
import type { BrowserWindowManager } from "../desktop/main/browser/browser-window-manager.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

export type ShortcutModifier = "alt" | "control" | "isautorepeat" | "meta" | "shift";

export function activeTab(manager: BrowserWindowManager): BrowserTab {
  const tab = manager.tabs?.activeTab();
  if (!tab) throw new Error("active Browser tab is unavailable");
  return tab;
}

export async function waitForActiveUrl(
  manager: BrowserWindowManager,
  url: string,
): Promise<void> {
  await waitForQa(() => {
    const state = manager.tabs?.activeTab()?.getState();
    return state?.url === url && !state.isLoading;
  }, `active URL ${url}`);
}

export async function waitForActive(
  manager: BrowserWindowManager,
  tabId: string,
  label: string,
): Promise<void> {
  await waitForQa(() => manager.tabs?.activeTab()?.id === tabId, label);
}

export async function focusFixtureInput(contents: WebContents): Promise<void> {
  const window = BrowserWindow.getAllWindows().find((item) => item.isVisible());
  window?.moveTop();
  window?.focus();
  contents.focus();
  await new Promise((resolve) => setTimeout(resolve, 20));
  await contents.executeJavaScript(
    "document.querySelector('#shortcut-sink')?.focus(); true", true,
  );
  await new Promise((resolve) => setTimeout(resolve, 10));
}

export async function sendShortcut(
  contents: WebContents,
  keyCode: string,
  modifiers: ShortcutModifier[],
): Promise<void> {
  BrowserWindow.getAllWindows().find((window) => window.isVisible())?.focus();
  contents.focus();
  await new Promise((resolve) => setTimeout(resolve, 10));
  contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  await new Promise((resolve) => setTimeout(resolve, 30));
}

export async function sendFixtureInputShortcut(
  contents: WebContents,
  keyCode: string,
  modifiers: ShortcutModifier[],
): Promise<void> {
  const focused = await contents.executeJavaScript(`(() => {
    const input = document.querySelector('#shortcut-sink');
    input?.focus();
    return document.activeElement === input;
  })()`, true) as boolean;
  if (!focused || !contents.isFocused()) {
    throw new Error("fixture input lost focus before shortcut dispatch");
  }
  contents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
  contents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  await new Promise((resolve) => setTimeout(resolve, 30));
}

export async function tabCenter(
  contents: WebContents,
  tabId: string,
): Promise<{ x: number; y: number }> {
  return contents.executeJavaScript(`(() => {
    const id = ${JSON.stringify(tabId)};
    const tab = [...document.querySelectorAll('.tab-activation[data-tab-id]')]
      .find((element) => element.dataset.tabId === id);
    if (!tab) throw new Error('tab button unavailable');
    const rect = tab.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2) };
  })()`, true) as Promise<{ x: number; y: number }>;
}

export async function sendMiddleClick(
  contents: WebContents,
  point: { x: number; y: number },
): Promise<void> {
  contents.sendInputEvent({ type: "mouseDown", ...point,
    button: "middle", clickCount: 1 });
  contents.sendInputEvent({ type: "mouseUp", ...point,
    button: "middle", clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 30));
}

export function zoomMatches(
  contents: WebContents,
  saved: number,
  expected: number,
): boolean {
  return Math.abs(saved - expected) < 0.001 &&
    Math.abs(contents.getZoomFactor() - expected) < 0.001;
}

import {
  BrowserWindow, desktopCapturer, nativeImage, type NativeImage,
} from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BrowserTabManager } from "../desktop/main/browser/browser-tab-manager.js";

export interface ShellInspection {
  addressFontSize: string;
  agentMessageFontSize: string | null;
  agentTargetCount: number;
  buttonLabels: string[];
  chromeHeight: number;
  clientWidth: number;
  colorScheme: string;
  hasAgentBar: boolean;
  hasPermissionNotice: boolean;
  progressVisible: boolean;
  newTabAdjacent: boolean;
  siteIdentityLabel: string | null;
  scrollWidth: number;
  tabCount: number;
}

export interface PageInspection {
  bodyBackground: string;
  colorScheme: string;
  searchBorderRadius: string | null;
  searchBoxShadow: string | null;
  text: string;
}

export async function setBrowserWindow(
  window: BrowserWindow, width: number, height: number, zoom: number,
): Promise<void> {
  window.webContents.setZoomFactor(zoom);
  window.setContentSize(width, height);
  window.show();
  window.focus();
  await delay(180);
}

export async function inspectShell(window: BrowserWindow): Promise<ShellInspection> {
  return window.webContents.executeJavaScript(`(() => {
    const chrome = document.querySelector('.browser-chrome');
    const address = document.querySelector('.address');
    const message = document.querySelector('.capsule-summary');
    if (!(chrome instanceof HTMLElement) || !(address instanceof HTMLElement)) return null;
    return {
      addressFontSize: getComputedStyle(address).fontSize,
      agentMessageFontSize: message instanceof HTMLElement
        ? getComputedStyle(message).fontSize : null,
      agentTargetCount: document.querySelectorAll('.agent-tab-marker').length,
      buttonLabels: [...document.querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label') || button.textContent?.trim() || ''),
      chromeHeight: chrome.offsetHeight,
      clientWidth: document.documentElement.clientWidth,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      hasAgentBar: Boolean(document.querySelector('.agent-capsule')),
      hasPermissionNotice: Boolean(document.querySelector('.permission-notice')),
      progressVisible: getComputedStyle(
        document.querySelector('.navigation-progress') || document.documentElement,
      ).opacity === '1',
      newTabAdjacent: (() => {
        const tabs = [...document.querySelectorAll('.tab-item')];
        const last = tabs.at(-1)?.getBoundingClientRect();
        const button = document.querySelector('.tab-new')?.getBoundingClientRect();
        if (!last || !button) return false;
        const gap = button.left - last.right;
        return gap >= 0 && gap <= 8;
      })(),
      siteIdentityLabel: document.querySelector('.site-identity')
        ?.getAttribute('aria-label') || null,
      scrollWidth: document.documentElement.scrollWidth,
      tabCount: document.querySelectorAll('[role="tab"]').length,
    };
  })()`, true) as Promise<ShellInspection>;
}

export async function captureShellWindow(
  window: BrowserWindow,
  artifacts: string,
  filename: string,
  inspection: ShellInspection,
): Promise<Record<string, unknown>> {
  const image = await captureWindow(window);
  await writeFile(join(artifacts, filename), image.toPNG());
  return { filename, imageSize: image.getSize(), inspection };
}

export async function captureActivePage(
  tabs: BrowserTabManager,
  artifacts: string,
  filename: string,
): Promise<Record<string, unknown>> {
  const contents = tabs.activeTab()?.view.webContents;
  if (!contents) throw new Error("active Browser page is unavailable");
  const inspection = await contents.executeJavaScript(`(() => {
    const search = document.querySelector('.search');
    return {
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
      searchBorderRadius: search instanceof HTMLElement
        ? getComputedStyle(search).borderRadius : null,
      searchBoxShadow: search instanceof HTMLElement
        ? getComputedStyle(search).boxShadow : null,
      text: document.body.innerText.slice(0, 2000),
    };
  })()`, true) as PageInspection;
  const captureMode = "cdp.Page.captureScreenshot";
  const debug = contents.debugger;
  const owned = !debug.isAttached();
  if (owned) debug.attach("1.3");
  let png: Buffer;
  try {
    const result = await debug.sendCommand("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    }) as { data?: string };
    if (!result.data) throw new Error("CDP page screenshot returned no data");
    png = Buffer.from(result.data, "base64");
  } finally {
    if (owned && debug.isAttached()) debug.detach();
  }
  await writeFile(join(artifacts, filename), png);
  return {
    captureMode,
    filename,
    imageSize: nativeImage.createFromBuffer(png).getSize(),
    inspection,
  };
}

export async function captureAgentInspector(
  contents: Electron.WebContents,
  artifacts: string,
  filename: string,
): Promise<Record<string, unknown>> {
  let image: NativeImage;
  let captureMode = "webContents.capturePage";
  try {
    image = await contents.capturePage();
    if (image.isEmpty()) throw new Error("empty inspector capture");
  } catch {
    captureMode = "cdp.Page.captureScreenshot";
    const debug = contents.debugger;
    const owned = !debug.isAttached();
    if (owned) debug.attach("1.3");
    try {
      const result = await debug.sendCommand("Page.captureScreenshot", {
        captureBeyondViewport: false, format: "png", fromSurface: true,
      }) as { data?: string };
      if (!result.data) throw new Error("Inspector screenshot returned no data");
      image = nativeImage.createFromBuffer(Buffer.from(result.data, "base64"));
    } finally {
      if (owned && debug.isAttached()) debug.detach();
    }
  }
  await writeFile(join(artifacts, filename), image.toPNG());
  return { captureMode, filename, imageSize: image.getSize() };
}

export async function readShellAxTree(window: BrowserWindow): Promise<unknown[]> {
  const debug = window.webContents.debugger;
  const owned = !debug.isAttached();
  if (owned) debug.attach("1.3");
  try {
    const result = await debug.sendCommand("Accessibility.getFullAXTree") as {
      nodes?: Array<{
        ignored?: boolean;
        name?: { value?: unknown };
        role?: { value?: unknown };
      }>;
    };
    return (result.nodes ?? []).filter((node) => !node.ignored).map((node) => ({
      name: String(node.name?.value ?? "").slice(0, 300),
      role: String(node.role?.value ?? "").slice(0, 80),
    }));
  } finally {
    if (owned && debug.isAttached()) debug.detach();
  }
}

async function captureWindow(window: BrowserWindow): Promise<NativeImage> {
  const bounds = window.getBounds();
  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize: { width: bounds.width, height: bounds.height },
    fetchWindowIcons: false,
  });
  const source = sources.find((item) =>
    item.name === window.getTitle() && !item.thumbnail.isEmpty());
  if (source) return source.thumbnail;
  return window.webContents.capturePage();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

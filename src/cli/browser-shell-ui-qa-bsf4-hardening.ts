import type { BrowserWindow } from "electron";

import { browserAgentQaView } from "./browser-agent-qa-fixture.js";
import { captureAgentInspector, setBrowserWindow } from
  "./browser-shell-ui-qa-capture.js";
import type { BrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";
import type { BrowserWindowManager } from
  "../desktop/main/browser/browser-window-manager.js";

type Expect = (name: string, passed: boolean) => void;

export async function runBrowserShellBsf4Hardening(input: {
  artifacts: string;
  browser: BrowserWindow;
  expect: Expect;
  fixture: BrowserShellFixture;
  manager: BrowserWindowManager;
}): Promise<Record<string, unknown>> {
  const { artifacts, browser, expect, fixture, manager } = input;
  const captures: Record<string, unknown> = {};
  const tabs = manager.tabs!;
  const original = tabs.activeTab()!;
  const home = tabs.newTab();
  await waitForQa(async () => home.view.webContents.executeJavaScript(
    "document.body?.innerText.includes('Coolto') === true", true,
  ) as Promise<boolean>, "hardening trusted home page");
  const source = (updatedAt: string) => ({
    taskId: "bsf4-hardening-task",
    conversationId: "bsf4-hardening-conversation",
    state: browserAgentQaView({ task: {
      goal: "验证焦点保持", status: "running", waitingReason: null, updatedAt,
    } }),
  });
  manager.agentStatus.setProjection(source("2026-08-31T01:00:00.000Z"));
  await waitForQa(async () => home.view.webContents.executeJavaScript(
    "document.body?.innerText.includes('验证焦点保持') === true", true,
  ) as Promise<boolean>, "hardening home task");
  await home.view.webContents.executeJavaScript(
    "document.querySelector('#q').value = 'keep-me'", true,
  );
  manager.shellCommands.toggleAgentInspector();
  const inspector = manager.shellCommands.inspectorWebContents()!;
  await waitForQa(async () => inspector.isFocused() && inspector.executeJavaScript(
    "document.activeElement?.id === 'browser-agent-inspector-heading'", true,
  ) as Promise<boolean>, "Inspector initial focus");
  const openMotion = await motionState(inspector);
  manager.agentStatus.setProjection(source("2026-08-31T01:01:00.000Z"));
  await delay(180);
  const draft = await home.view.webContents.executeJavaScript(
    "document.querySelector('#q')?.value ?? ''", true,
  ) as string;
  expect("BSF4-H01 timestamp-only projection preserves home input and Inspector focus",
    draft === "keep-me" && inspector.isFocused());

  await inspector.executeJavaScript(
    "document.querySelector('.close-inspector')?.click()", true,
  );
  await waitForQa(async () => (await motionState(inspector)).presentation === "closing",
    "Inspector closing motion");
  const closingMotion = await motionState(inspector);
  await delay(190);
  const capsuleFocused = await browser.webContents.executeJavaScript(
    "document.activeElement?.classList.contains('agent-capsule') === true", true,
  ) as boolean;
  expect("BSF4-H02 Inspector uses 220/160ms motion and restores capsule focus",
    openMotion.duration === "0.22s" && closingMotion.duration === "0.16s" &&
    capsuleFocused);
  manager.agentStatus.clearProjection();

  const downloadTab = tabs.newTab(fixture.baseUrl);
  await waitForQa(() => downloadTab.getState().title === "Favicon fixture",
    "hardening download page");
  downloadTab.view.webContents.downloadURL(
    `${fixture.baseUrl}/download?name=keyboard.bin&size=262144`,
  );
  await waitForQa(async () => browser.webContents.executeJavaScript(
    "Boolean(document.querySelector('.download-trigger'))", true,
  ) as Promise<boolean>, "hardening download trigger");
  await browser.webContents.executeJavaScript(
    "document.querySelector('.download-trigger')?.click()", true,
  );
  const downloads = manager.shellCommands.downloadPopoverWebContents()!;
  await waitForQa(async () => downloads.isFocused() && downloads.executeJavaScript(
    "document.activeElement?.getAttribute('aria-label') === '关闭下载'", true,
  ) as Promise<boolean>, "download popover initial focus");
  downloads.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  downloads.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await waitForQa(async () => !manager.shellCommands.isDownloadPopoverOpen &&
    browser.webContents.executeJavaScript(
      "document.activeElement?.classList.contains('download-trigger') === true", true,
    ) as Promise<boolean>, "download trigger focus restoration");
  expect("BSF4-H03 download popover enters and restores the keyboard focus path", true);

  manager.toggleDownloadPopover();
  manager.open({ theme: "dark", locale: "en-US" });
  await setBrowserWindow(browser, 720, 520, 2);
  const responsive = await inspectDownloads(downloads);
  expect("BSF4-H04 dark English downloads fit 720px at 200 percent",
    responsive.colorScheme === "dark" && responsive.text.includes("Downloads") &&
    responsive.text.includes("Downloading 1 file") &&
    !responsive.text.includes("Downloading 1 files") &&
    responsive.noHorizontalOverflow && responsive.actionsVisible);
  captures.downloadDarkEn200 = await captureAgentInspector(
    downloads, artifacts, "34-bsf4-download-dark-en-720-200.png",
  );

  manager.shellCommands.closeDownloadPopover();
  for (const tab of [...tabs.allTabs()]) {
    if (tab.id !== original.id) tabs.closeTab(tab.id);
  }
  tabs.select(original.id);
  manager.open({ theme: "light", locale: "zh-CN" });
  await setBrowserWindow(browser, 1180, 820, 1);
  return captures;
}

async function motionState(contents: Electron.WebContents): Promise<{
  duration: string; presentation: string;
}> {
  return contents.executeJavaScript(`(() => {
    const root = document.querySelector('.agent-inspector');
    return {
      duration: root ? getComputedStyle(root).animationDuration : '',
      presentation: root?.classList.contains('presentation-closing')
        ? 'closing' : 'open',
    };
  })()`, true) as Promise<any>;
}

async function inspectDownloads(contents: Electron.WebContents): Promise<{
  actionsVisible: boolean; colorScheme: string; noHorizontalOverflow: boolean;
  text: string;
}> {
  return contents.executeJavaScript(`(() => ({
    actionsVisible: (() => {
      const close = document.querySelector('.download-header button');
      if (!close) return false;
      const closeRect = close.getBoundingClientRect();
      return closeRect.top >= 0 && closeRect.bottom <= innerHeight &&
        [...document.querySelectorAll('button')].every(button => {
      const rect = button.getBoundingClientRect();
          return rect.left >= 0 && rect.right <= innerWidth;
        });
    })(),
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth,
    text: document.body.innerText,
  }))()`, true) as Promise<any>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

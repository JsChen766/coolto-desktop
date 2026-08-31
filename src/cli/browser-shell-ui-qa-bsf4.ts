import { type BrowserWindow } from "electron";

import { browserAgentQaView } from "./browser-agent-qa-fixture.js";
import { captureActivePage, captureAgentInspector, captureShellWindow, inspectShell } from
  "./browser-shell-ui-qa-capture.js";
import type { BrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";
import { getBrowserSession } from "../desktop/main/browser/browser-session.js";
import type { BrowserWindowManager } from
  "../desktop/main/browser/browser-window-manager.js";

type Expect = (name: string, passed: boolean) => void;

export async function runBrowserShellBsf4Qa(input: {
  artifacts: string;
  browser: BrowserWindow;
  expect: Expect;
  fixture: BrowserShellFixture;
  main: BrowserWindow;
  manager: BrowserWindowManager;
}): Promise<Record<string, unknown>> {
  const { artifacts, browser, expect, fixture, main, manager } = input;
  const captures: Record<string, unknown> = {};
  const tabs = manager.tabs!;
  const original = tabs.activeTab()!;
  manager.agentStatus.clearProjection();
  const home = tabs.newTab();
  await waitForQa(async () => (await pageText(home)).includes("Coolto"),
    "the idle BSF4 home page");
  const idle = await homeInspection(home);
  expect("BSF4-01 new tab has one clear idle action without fabricated data",
    idle.placeholder === "搜索或输入网址" && idle.taskCount === 0 &&
    !idle.text.includes("最近站点"));

  manager.agentStatus.setProjection({
    taskId: "bsf4-task", conversationId: "bsf4-conversation",
    state: browserAgentQaView({ task: {
      goal: "核对真实职位页面", status: "running", waitingReason: null,
      updatedAt: new Date().toISOString(),
    } }),
  });
  await waitForQa(async () => (await pageText(home)).includes("继续任务"),
    "the active task on the BSF4 home page");
  const running = await pageText(home);
  expect("BSF4-02 new tab projects the current task from the existing bridge",
    running.includes("当前任务") && running.includes("核对真实职位页面"));

  manager.agentStatus.setProjection({
    taskId: "bsf4-task", conversationId: "bsf4-conversation",
    state: browserAgentQaView({
      task: {
        goal: "核对真实职位页面", status: "waiting", waitingReason: "approval",
        updatedAt: new Date().toISOString(),
      },
      currentAction: null, modelActive: false,
    }),
  });
  await waitForQa(async () => (await pageText(home)).includes("完成待确认操作"),
    "the waiting task on the BSF4 home page");
  main.hide();
  await home.view.webContents.executeJavaScript(
    "document.querySelector('.task-action')?.click()", true,
  );
  await waitForQa(() => main.isVisible(), "the trusted home task deep link");
  home.navigate(`${fixture.baseUrl}/tabs?title=External%20page`);
  await waitForQa(() => home.getState().title === "External page", "external action page");
  main.hide();
  await home.view.webContents.executeJavaScript(
    "location.href='coolto-browser-action://open-task/forged-token'", true,
  );
  await delay(120);
  expect("BSF4-03 waiting deep link is trusted and external pages cannot invoke it",
    !main.isVisible() && home.getState().url?.startsWith(fixture.baseUrl) === true);
  await browser.webContents.executeJavaScript(
    "document.querySelector('.handoff-button')?.click()", true,
  );
  await waitForQa(() => main.isVisible(), "the trusted page handoff to the App");
  expect("BSF4-03b trusted Chrome hands the current page to the App without starting a task",
    home.getState().title === "External page" &&
    manager.agentStatus.taskId() === "bsf4-task");

  manager.open({ theme: "dark", locale: "en-US" });
  const offlineSession = getBrowserSession();
  offlineSession.enableNetworkEmulation({ offline: true });
  const offlineHome = tabs.newTab();
  await waitForQa(async () => (await pageText(offlineHome)).includes("Coolto"),
    "the offline English BSF4 home page");
  const offline = await offlineHome.view.webContents.executeJavaScript(`({
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    text: document.body.innerText
  })`, true) as { colorScheme: string; text: string };
  offlineSession.disableNetworkEmulation();
  expect("BSF4-04 new tab remains actionable offline in dark English mode",
    offline.colorScheme === "dark" && offline.text.includes("Continue task") &&
    offline.text.includes("Needs your attention"));
  captures.newTabWaiting = await captureActivePage(
    tabs, artifacts, "30-bsf4-new-tab-waiting.png",
  );

  manager.agentStatus.clearProjection();
  manager.open({ theme: "light", locale: "zh-CN" });
  const downloadTab = tabs.newTab(fixture.baseUrl);
  await waitForQa(() => downloadTab.getState().title === "Favicon fixture",
    "the BSF4 download page");
  const sameUrl = `${fixture.baseUrl}/download?name=same.bin&size=393216`;
  downloadTab.view.webContents.downloadURL(sameUrl);
  downloadTab.view.webContents.downloadURL(sameUrl);
  await waitForQa(async () => (await downloadInspection(browser, manager)).buttonVisible,
    "the download toolbar button");
  await browser.webContents.executeJavaScript(
    "document.querySelector('.download-trigger')?.click()", true,
  );
  await waitForQa(async () => (await downloadInspection(browser, manager)).sameNameCount === 2,
    "two concurrent same-name downloads");
  await waitForQa(async () => (await downloadInspection(browser, manager)).progressCount > 0,
    "non-zero concurrent download progress");
  const progressing = await downloadInspection(browser, manager);
  expect("BSF4-05 concurrent same-name downloads expose real progress independently",
    progressing.sameNameCount === 2 && progressing.progressCount > 0);
  await waitForQa(async () => {
    const view = await downloadInspection(browser, manager);
    return view.sameNameCount === 2 && view.sameNameCompleted === 2;
  }, "two completed same-name downloads");

  getBrowserSession().once("will-download", (_event, item) => {
    setTimeout(() => item.cancel(), 90);
  });
  downloadTab.view.webContents.downloadURL(
    `${fixture.baseUrl}/download?name=cancel.bin&size=524288`,
  );
  await waitForQa(async () => (await downloadInspection(browser, manager)).text
    .includes("下载已取消"), "cancelled download state");
  downloadTab.view.webContents.downloadURL(
    `${fixture.baseUrl}/download?name=interrupt.bin&size=524288&mode=interrupt`,
  );
  await waitForQa(async () => {
    const view = await downloadInspection(browser, manager);
    return view.text.includes("下载已取消") && view.text.includes("下载已中断") &&
      view.text.includes("下载完成");
  }, "completed cancelled and interrupted download states", 12_000);
  const terminal = await downloadInspection(browser, manager);
  expect("BSF4-06 download UI distinguishes complete cancel and interruption states",
    terminal.text.includes("下载完成") && terminal.text.includes("下载已取消") &&
    terminal.text.includes("下载已中断"));

  const beforeDismiss = terminal.rowCount;
  await manager.shellCommands.downloadPopoverWebContents()!.executeJavaScript(
    "document.querySelector('.download-row .dismiss')?.click()", true,
  );
  await waitForQa(async () => (await downloadInspection(browser, manager)).rowCount < beforeDismiss,
    "dismissed download record");
  browser.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  browser.webContents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await waitForQa(async () => !(await downloadInspection(browser, manager)).popoverOpen,
    "Escape closing download popover");
  expect("BSF4-07 download records dismiss and Escape closes only the popover",
    downloadTab.getState().url === fixture.baseUrl + "/");

  manager.toggleDownloadPopover();
  await waitForQa(async () => (await downloadInspection(browser, manager)).popoverOpen,
    "download popover for path inspection");
  const pathInspection = await downloadInspection(browser, manager);
  const privateRoot = process.env.COOLTO_BROWSER_QA_DOWNLOAD_ROOT ?? "";
  expect("BSF4-08 Renderer download state never exposes an absolute local path",
    Boolean(privateRoot) && !pathInspection.html.includes(privateRoot) &&
    !pathInspection.text.includes(privateRoot));
  captures.downloadPopover = await captureShellWindow(
    browser, artifacts, "31-bsf4-download-popover.png", await inspectShell(browser),
  );
  captures.downloadPopoverView = await captureAgentInspector(
    manager.shellCommands.downloadPopoverWebContents()!, artifacts,
    "32-bsf4-download-popover-view.png",
  );

  manager.shellCommands.closeDownloadPopover();
  for (const tab of [...tabs.allTabs()]) {
    if (tab.id !== original.id) tabs.closeTab(tab.id);
  }
  tabs.select(original.id);
  return captures;
}

async function pageText(tab: { view: { webContents: Electron.WebContents } }): Promise<string> {
  return tab.view.webContents.executeJavaScript(
    "document.body?.innerText ?? ''", true,
  ) as Promise<string>;
}

async function homeInspection(tab: {
  view: { webContents: Electron.WebContents };
}): Promise<{ placeholder: string | null; taskCount: number; text: string }> {
  return tab.view.webContents.executeJavaScript(`({
    placeholder: document.querySelector('#q')?.getAttribute('placeholder') ?? null,
    taskCount: document.querySelectorAll('.task').length,
    text: document.body?.innerText ?? ''
  })`, true) as Promise<any>;
}

async function downloadInspection(
  browser: BrowserWindow,
  manager: BrowserWindowManager,
): Promise<{
  buttonVisible: boolean; contentFits: boolean; html: string; popoverOpen: boolean;
  progressCount: number;
  rowCount: number; sameNameCompleted: number; sameNameCount: number; text: string;
}> {
  const shell = await browser.webContents.executeJavaScript(`({
    buttonVisible: Boolean(document.querySelector('.download-trigger')),
    html: document.querySelector('.download-trigger')?.outerHTML ?? ''
  })`, true) as { buttonVisible: boolean; html: string };
  const contents = manager.shellCommands.downloadPopoverWebContents();
  if (!manager.shellCommands.isDownloadPopoverOpen || !contents) return {
    ...shell, contentFits: false, popoverOpen: false, progressCount: 0, rowCount: 0,
    sameNameCompleted: 0, sameNameCount: 0, text: "",
  };
  const panel = await contents.executeJavaScript(`(() => {
    const root = document.querySelector('.download-popover');
    const list = document.querySelector('.download-list');
    const rows = [...document.querySelectorAll('.download-row')];
    return {
      html: root?.outerHTML ?? '',
      contentFits: !list || list.scrollHeight <= list.clientHeight + 1,
      popoverOpen: Boolean(root),
      progressCount: [...document.querySelectorAll('progress')]
        .filter(item => item.value > 0 && item.value < 100).length,
      rowCount: rows.length,
      sameNameCompleted: rows.filter(row => row.textContent?.includes('same.bin') &&
        row.textContent?.includes('下载完成')).length,
      sameNameCount: rows.filter(row => row.textContent?.includes('same.bin')).length,
      text: root?.textContent ?? '',
    };
  })()`, true) as Record<string, any>;
  return { ...panel, buttonVisible: shell.buttonVisible, html: shell.html + panel.html } as any;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

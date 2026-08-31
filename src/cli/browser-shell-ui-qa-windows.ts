import type { BrowserWindow } from "electron";

import type { BrowserWindowManager } from "../desktop/main/browser/browser-window-manager.js";
import {
  activeTab,
  focusFixtureInput,
  sendFixtureInputShortcut,
  sendMiddleClick,
  sendShortcut,
  tabCenter,
  waitForActive,
  waitForActiveUrl,
} from "./browser-shell-ui-qa-efficiency-actions.js";
import {
  focusActiveShellTab,
  inspectEfficiencyShell,
} from "./browser-shell-ui-qa-efficiency-inspection.js";
import type { BrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

type Expect = (name: string, passed: boolean) => void;

export async function runBrowserShellWindows(input: {
  browser: BrowserWindow;
  expect: Expect;
  fixture: BrowserShellFixture;
  manager: BrowserWindowManager;
}): Promise<void> {
  const { browser, expect, fixture, manager } = input;
  const pageA = `${fixture.baseUrl}/efficiency-a?windows=reload`;
  manager.navigate(pageA);
  await waitForActiveUrl(manager, pageA);
  const reloadBefore = fixture.requestCount("/efficiency-a");
  await focusFixtureInput(activeTab(manager).view.webContents);
  await sendShortcut(activeTab(manager).view.webContents, "R", ["control"]);
  await waitForRequestCount(fixture, "/efficiency-a", reloadBefore + 1);
  await waitForActiveUrl(manager, pageA);

  const failedUrl = "http://127.0.0.1:65534/bsf2-reload-shortcut";
  manager.navigate(failedUrl);
  await waitForQa(() => activeTab(manager).getState().failure?.url === failedUrl,
    "initial shortcut reload failure");
  const failedContents = activeTab(manager).view.webContents;
  const retryTargets: string[] = [];
  const onNavigation = (
    details: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>,
  ): void => {
    if (details.isMainFrame && details.url === failedUrl) retryTargets.push(details.url);
  };
  failedContents.on("did-start-navigation", onNavigation);
  try {
    failedContents.focus();
    await sendShortcut(failedContents, "F5", []);
    await waitForQa(() => retryTargets.length === 1, "F5 retry of failed URL");
    await waitForQa(() => activeTab(manager).getState().failure?.url === failedUrl &&
      !activeTab(manager).getState().isLoading, "retried failure to settle");
  } finally {
    failedContents.off("did-start-navigation", onNavigation);
  }
  expect("BSF2-WIN-01 Ctrl+R reloads and F5 retries the failed URL exactly once",
    fixture.requestCount("/efficiency-a") === reloadBefore + 1 &&
    retryTargets.length === 1);

  const slowUrl = `${fixture.baseUrl}/slow?shortcut-stop=1`;
  manager.navigate(slowUrl);
  await waitForQa(() => {
    const state = activeTab(manager).getState();
    return state.url === slowUrl && state.isLoading && !state.find.open;
  }, "slow page loading for Escape");
  await waitForPageInput(activeTab(manager).view.webContents);
  await waitForQa(() => activeTab(manager).view.webContents.executeJavaScript(
    "globalThis.__escapeEvents === 0", true,
  ) as Promise<boolean>, "slow page Escape recorder");
  await focusFixtureInput(activeTab(manager).view.webContents);
  await sendShortcut(activeTab(manager).view.webContents, "Escape", []);
  await waitForQa(() => !activeTab(manager).getState().isLoading,
    "Escape to stop loading");
  const stopped = activeTab(manager).getState();
  const escapeEvents = await activeTab(manager).view.webContents.executeJavaScript(
    "globalThis.__escapeEvents ?? -1", true,
  ) as number;
  const stoppedOk = stopped.url === slowUrl && stopped.failure === null &&
    stopped.loadPhase === "complete" && escapeEvents >= 0 && escapeEvents <= 1;
  if (!stoppedOk) {
    throw new Error(`Escape stop mismatch: ${JSON.stringify({
      escapeEvents, failure: stopped.failure, loadPhase: stopped.loadPhase,
      url: stopped.url,
    })}`);
  }
  expect("BSF2-WIN-02 Escape stops loading without failure or duplicate events",
    stoppedOk);

  const historyA = `${fixture.baseUrl}/efficiency-a?history=a`;
  const historyB = `${fixture.baseUrl}/efficiency-b?history=b`;
  manager.navigate(historyA);
  await waitForActiveUrl(manager, historyA);
  manager.navigate(historyB);
  await waitForActiveUrl(manager, historyB);
  await focusFixtureInput(activeTab(manager).view.webContents);
  await sendShortcut(activeTab(manager).view.webContents, "Left", ["alt"]);
  await waitForActiveUrl(manager, historyA);
  await focusFixtureInput(activeTab(manager).view.webContents);
  await sendShortcut(activeTab(manager).view.webContents, "Right", ["alt"]);
  await waitForActiveUrl(manager, historyB);
  expect("BSF2-WIN-03 Alt+Left and Alt+Right traverse page history",
    activeTab(manager).getState().url === historyB);

  const editContents = activeTab(manager).view.webContents;
  const observedInputs: string[] = [];
  const observeInput = (_event: Electron.Event, value: Electron.Input): void => {
    observedInputs.push(`${value.type}:${value.code}:${value.control}`);
  };
  editContents.on("before-input-event", observeInput);
  await editContents.executeJavaScript(`(() => {
    globalThis.__shortcutKeys = [];
    globalThis.__copyEvents = 0;
    globalThis.__pasteEvents = 0;
  })()`, true);
  await focusFixtureInput(editContents);
  await waitForQa(() => editContents.isFocused() && editContents.executeJavaScript(
    "document.activeElement?.id === 'shortcut-sink'", true,
  ) as Promise<boolean>, "editing shortcut page focus");
  let selected = false;
  try {
    await sendFixtureInputShortcut(editContents, "A", ["control"]);
    selected = await editContents.executeJavaScript(`(() => {
      const input = document.querySelector('#shortcut-sink');
      return input?.selectionStart === 0 && input?.selectionEnd === input?.value.length;
    })()`, true) as boolean;
    for (const key of ["C", "V", "Z"]) {
      await sendFixtureInputShortcut(editContents, key, ["control"]);
    }
  } finally {
    editContents.off("before-input-event", observeInput);
  }
  const editing = await readEditingEvidence(editContents);
  const editingOk = selected && editing.keys === "a,c,v,z" &&
    editing.copyEvents === 1 && editing.pasteEvents === 1;
  if (!editingOk) {
    throw new Error(`Editing shortcut mismatch: ${JSON.stringify({
      ...editing,
      browserFocused: browser.isFocused(),
      inspectorFocused: manager.shellCommands.inspectorWebContents()?.isFocused() ?? false,
      observedInputs,
      pageFocused: editContents.isFocused(),
      selected,
    })}`);
  }
  expect("BSF2-WIN-04 common editing shortcuts stay in the page exactly once",
    editingOk);

  const root = activeTab(manager);
  const deleteTab = manager.tabs!.newTab();
  const rightTab = manager.tabs!.newTab();
  manager.tabs!.select(deleteTab.id);
  await waitForActive(manager, deleteTab.id, "tab selected for Delete");
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).tabCount === 3,
    "three tabs in shell");
  await focusActiveShellTab(browser);
  await sendShortcut(browser.webContents, "Delete", ["shift"]);
  await sendShortcut(browser.webContents, "Delete", ["isautorepeat"]);
  if (manager.tabs!.allTabs().length !== 3) {
    throw new Error("modified or repeated Delete closed a tab");
  }
  await sendShortcut(browser.webContents, "Delete", []);
  await waitForActive(manager, rightTab.id, "right neighbor after Delete");
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).tabFocused,
    "neighbor tab focus after Delete");
  manager.tabs!.select(root.id);
  await waitForActive(manager, root.id, "root selected before middle close");
  await focusActiveShellTab(browser);
  const point = await waitForTabCenter(browser, rightTab.id);
  await sendMiddleClick(browser.webContents, point);
  await waitForQa(() => !manager.tabs!.tab(rightTab.id), "middle-click tab close");
  expect("BSF2-WIN-05 Delete and middle click close only the intended tabs",
    !manager.tabs!.tab(deleteTab.id) && manager.tabs!.allTabs().length === 1 &&
    activeTab(manager).id === root.id);
}

async function waitForRequestCount(
  fixture: BrowserShellFixture,
  path: string,
  expected: number,
): Promise<void> {
  await waitForQa(() => {
    const count = fixture.requestCount(path);
    if (count > expected) throw new Error(`${path} reloaded ${count - expected + 1} extra times`);
    return count === expected;
  }, `request count ${expected} for ${path}`);
}

async function waitForPageInput(contents: Electron.WebContents): Promise<void> {
  await waitForQa(() => contents.executeJavaScript(
    "Boolean(document.querySelector('#shortcut-sink'))", true,
  ) as Promise<boolean>, "page shortcut input");
}

async function readEditingEvidence(contents: Electron.WebContents): Promise<{
  copyEvents: number; keys: string; pasteEvents: number;
}> {
  return contents.executeJavaScript(`({
    copyEvents: globalThis.__copyEvents ?? -1,
    keys: (globalThis.__shortcutKeys ?? []).join(','),
    pasteEvents: globalThis.__pasteEvents ?? -1,
  })`, true) as Promise<{ copyEvents: number; keys: string; pasteEvents: number }>;
}

async function waitForTabCenter(
  browser: BrowserWindow,
  tabId: string,
): Promise<{ x: number; y: number }> {
  let point: { x: number; y: number } | undefined;
  await waitForQa(async () => {
    point = await tabCenter(browser.webContents, tabId).catch(() => undefined);
    return Boolean(point);
  }, "middle-click tab rect");
  return point!;
}

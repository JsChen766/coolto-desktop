import type { BrowserWindow } from "electron";

import type { BrowserWindowManager } from "../desktop/main/browser/browser-window-manager.js";
import {
  captureShellWindow,
  inspectShell,
  setBrowserWindow,
} from "./browser-shell-ui-qa-capture.js";
import {
  focusActiveShellTab,
  inspectEfficiencyShell,
} from "./browser-shell-ui-qa-efficiency-inspection.js";
import {
  activeTab,
  focusFixtureInput,
  sendShortcut,
  waitForActive,
  waitForActiveUrl,
  zoomMatches,
  type ShortcutModifier,
} from "./browser-shell-ui-qa-efficiency-actions.js";
import type { BrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";
type Expect = (name: string, passed: boolean) => void;

export async function runBrowserShellEfficiency(input: {
  artifacts: string;
  browser: BrowserWindow;
  expect: Expect;
  fixture: BrowserShellFixture;
  manager: BrowserWindowManager;
}): Promise<Record<string, unknown>> {
  const { artifacts, browser, expect, fixture, manager } = input;
  const primary: ShortcutModifier = process.platform === "darwin" ? "meta" : "control";
  const captures: Record<string, unknown> = {};
  manager.agentStatus.clear();
  manager.navigate(`${fixture.baseUrl}/efficiency-a`);
  await waitForActiveUrl(manager, `${fixture.baseUrl}/efficiency-a`);
  const tabA = activeTab(manager);
  await focusFixtureInput(tabA.view.webContents);
  await sendShortcut(tabA.view.webContents, "L", [primary]);
  await waitForQa(async () => (await inspectEfficiencyShell(input.browser))
    .addressFocusedAndSelected, "page shortcut to focus the address bar");
  const leakedKeys = await tabA.view.webContents.executeJavaScript(
    "globalThis.__shortcutKeys ?? []", true,
  ) as string[];
  expect("BSF2-01 page shortcut focuses the address bar without leaking L",
    !leakedKeys.includes("l"));

  await sendShortcut(browser.webContents, "T", [primary]);
  await waitForQa(() => manager.tabs?.allTabs().length === 2, "shortcut new tab");
  const tabB = activeTab(manager);
  manager.navigate(`${fixture.baseUrl}/efficiency-b`);
  await waitForActiveUrl(manager, `${fixture.baseUrl}/efficiency-b`);
  tabB.view.webContents.focus();
  await sendShortcut(tabB.view.webContents, "1", [primary]);
  await waitForActive(manager, tabA.id, "shortcut first tab");
  await sendShortcut(tabA.view.webContents, "Tab", ["control"]);
  await waitForActive(manager, tabB.id, "shortcut next tab");

  await sendShortcut(tabB.view.webContents, "1", [primary]);
  await waitForActive(manager, tabA.id, "find fixture tab");
  await focusFixtureInput(tabA.view.webContents);
  await sendShortcut(tabA.view.webContents, "F", [primary]);
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).findFocused,
    "find input focus");
  browser.webContents.insertText("CooltoNeedle");
  await waitForQa(() => activeTab(manager).getState().find.matches === 4,
    "four find-in-page matches");
  await sendShortcut(browser.webContents, "Enter", []);
  await waitForQa(() => activeTab(manager).getState().find.activeMatchOrdinal === 2,
    "next find result");
  await sendShortcut(browser.webContents, "Enter", ["shift"]);
  await waitForQa(() => activeTab(manager).getState().find.activeMatchOrdinal === 1,
    "previous find result");
  expect("BSF2-02 Electron find reports count and both directions",
    activeTab(manager).getState().find.matches === 4);

  await sendShortcut(browser.webContents, "2", [primary]);
  await waitForActive(manager, tabB.id, "second tab during find");
  const tabBFind = tabB.getState().find;
  await sendShortcut(tabB.view.webContents, "1", [primary]);
  await waitForActive(manager, tabA.id, "return to first find tab");
  const restoredFind = tabA.getState().find;
  expect("BSF2-03 find state stays isolated by tab",
    tabBFind.query === "" && restoredFind.query === "CooltoNeedle" &&
    restoredFind.matches === 4 && restoredFind.activeMatchOrdinal === 1);
  await sendShortcut(tabA.view.webContents, "F", [primary]);
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).findFocused,
    "refocused find input before close");
  await sendShortcut(browser.webContents, "Escape", []);
  await waitForQa(() => !tabA.getState().find.open, "find close from page focus");
  expect("BSF2-04 Escape closes find and returns focus to the page",
    !(await inspectEfficiencyShell(browser)).findVisible &&
    tabA.view.webContents.isFocused());

  await sendShortcut(tabA.view.webContents, "+", [primary, "shift"]);
  await waitForQa(() => zoomMatches(tabA.view.webContents, tabA.getState().zoomFactor, 1.1),
    "first tab zoom in");
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).zoomBadge === "110%",
    "first tab zoom badge");
  const firstZoomShell = await inspectEfficiencyShell(browser);
  await sendShortcut(tabA.view.webContents, "2", [primary]);
  await waitForActive(manager, tabB.id, "second tab zoom isolation");
  await waitForQa(() => zoomMatches(tabB.view.webContents, tabB.getState().zoomFactor, 1),
    "second tab default zoom");
  const secondShell = await inspectEfficiencyShell(browser);
  await sendShortcut(tabB.view.webContents, "1", [primary]);
  await waitForActive(manager, tabA.id, "restore first tab zoom");
  await waitForQa(() => zoomMatches(tabA.view.webContents, tabA.getState().zoomFactor, 1.1),
    "restored first tab zoom");
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).zoomBadge === "110%",
    "restored first tab zoom badge");
  const restoredZoomShell = await inspectEfficiencyShell(browser);
  await sendShortcut(tabA.view.webContents, "0", [primary]);
  await waitForQa(() => zoomMatches(tabA.view.webContents, tabA.getState().zoomFactor, 1),
    "reset first tab zoom");
  expect("BSF2-05 same-origin zoom stays isolated and resettable",
    firstZoomShell.zoomBadge === "110%" && secondShell.zoomBadge === null &&
    restoredZoomShell.zoomBadge === "110%" &&
    (await inspectEfficiencyShell(browser)).zoomBadge === null);

  await sendShortcut(tabA.view.webContents, "2", [primary]);
  await waitForActive(manager, tabB.id, "second tab before shortcut close");
  await sendShortcut(tabB.view.webContents, "W", [primary]);
  await waitForQa(() => manager.tabs?.allTabs().length === 1, "shortcut close tab");
  expect("BSF2-06 shell and page tab shortcuts create select cycle and close",
    manager.tabs?.activeTab()?.id === tabA.id);

  for (let index = 1; index < 12; index += 1) {
    const title = encodeURIComponent(`QA Tab ${String(index + 1).padStart(2, "0")} long title`);
    manager.tabs!.newTab(`${fixture.baseUrl}/tabs?title=${title}`);
  }
  await waitForQa(() => manager.tabs?.allTabs().length === 12, "twelve browser tabs");
  await waitForQa(() => activeTab(manager).getState().title.startsWith("QA Tab 12"),
    "twelfth tab title");
  await setBrowserWindow(browser, 940, 680, 1);
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).hasOverflowControls,
    "tab overflow controls");
  const layout = await inspectEfficiencyShell(browser);
  captures.tabs12 = await captureShellWindow(
    browser, artifacts, "17-bsf2-tabs-12-940.png", await inspectShell(browser),
  );
  captures.tabs12Layout = layout;
  expect("BSF2-07 twelve tabs stay bounded with visible overflow affordance",
    layout.tabCount === 12 && layout.noDocumentOverflow && layout.activeTabVisible &&
    layout.rovingTabStops === 1 && layout.activeTabTooltip?.includes("QA Tab 12") === true &&
    layout.activeTabTooltip.includes(`${fixture.baseUrl}/tabs?title=`));
  for (let index = 12; index < 30; index += 1) manager.tabs!.newTab();
  await waitForQa(() => manager.tabs?.allTabs().length === 30,
    "thirty browser tabs", 45_000);
  const lastTabId = activeTab(manager).id;
  await setBrowserWindow(browser, 720, 520, 2);
  await sendShortcut(activeTab(manager).view.webContents, "1", [primary]);
  await waitForActive(manager, tabA.id, "first tab under 200 percent shell zoom");
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).activeTabVisible,
    "first tab visible under stress");
  const orderedTabs = [...manager.tabs!.allTabs()];
  const middleTab = orderedTabs[14]!;
  for (let index = 1; index <= 14; index += 1) {
    await sendShortcut(activeTab(manager).view.webContents, "Tab", ["control"]);
    await waitForActive(manager, orderedTabs[index]!.id, `cycle to tab ${index + 1}`);
  }
  const middleVisible = (await inspectEfficiencyShell(browser)).activeTabVisible &&
    activeTab(manager).id === middleTab.id;
  await sendShortcut(middleTab.view.webContents, "9", [primary]);
  await waitForActive(manager, lastTabId, "last tab under 200 percent shell zoom");
  await focusActiveShellTab(browser);
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).tabFocused,
    "focused active shell tab");
  await sendShortcut(browser.webContents, "Right", []);
  await waitForActive(manager, tabA.id, "roving tab wrap to first");
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).tabFocused,
    "roving focus after wrap");
  await sendShortcut(browser.webContents, "End", []);
  await waitForActive(manager, lastTabId, "roving tab End to last");
  await waitForQa(async () => (await inspectEfficiencyShell(browser)).tabFocused,
    "roving focus after End");
  const stress = await inspectEfficiencyShell(browser);
  captures.tabs30 = await captureShellWindow(
    browser, artifacts, "18-bsf2-tabs-30-720-zoom-200.png", await inspectShell(browser),
  );
  captures.tabs30Layout = stress;
  expect("BSF2-08 first middle and last tabs remain keyboard-reachable under stress",
    stress.tabCount === 30 && stress.hasOverflowControls &&
    stress.noDocumentOverflow && stress.activeTabVisible && middleVisible &&
    stress.rovingTabStops === 1 && stress.tabFocused);
  await setBrowserWindow(browser, 1180, 820, 1);
  for (const tab of [...manager.tabs!.allTabs()]) {
    if (tab.id !== tabA.id) manager.tabs!.closeTab(tab.id);
  }
  manager.tabs!.select(tabA.id);
  return captures;
}

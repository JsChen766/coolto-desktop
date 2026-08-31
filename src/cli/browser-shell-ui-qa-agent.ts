import type { BrowserWindow } from "electron";

import type { BrowserWindowManager } from
  "../desktop/main/browser/browser-window-manager.js";
import type { BrowserAgentProjectionFacts } from "../desktop/shared/types.js";
import { browserAgentQaView } from "./browser-agent-qa-fixture.js";
import {
  captureActivePage, captureAgentInspector, captureShellWindow,
  inspectShell, setBrowserWindow,
} from "./browser-shell-ui-qa-capture.js";
import type { BrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

type Expect = (name: string, passed: boolean) => void;

export async function runBrowserShellAgentQa(input: {
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
  const target = tabs.newTab(`${fixture.baseUrl}/tabs?title=Agent%20target`);
  const active = tabs.newTab(`${fixture.baseUrl}/tabs?title=Active%20page`);
  await waitForQa(() => tabs.allTabs().length === 3 &&
    active.getState().title === "Active page", "three Agent QA tabs");

  const projection = browserAgentQaView({
    currentAction: {
      kind: "observe", impact: "read", targetOrigin: fixture.baseUrl,
      targetTabId: target.id, startedAt: new Date().toISOString(),
    },
    activity: recentActivity(fixture.baseUrl),
  });
  const source = {
    taskId: "browser-shell-agent-qa-task",
    conversationId: "browser-shell-agent-qa-conversation",
    state: projection,
  };
  manager.agentStatus.setProjection(source);
  manager.agentStatus.setProjection(source);
  await waitForQa(async () => (await inspectAgentShell(browser)).markerCount === 1,
    "the non-active Agent target marker");
  const shell = await inspectAgentShell(browser);
  expect("BSF3-04 three tabs keep the Agent marker on the non-active target only",
    shell.tabCount === 3 && shell.activeTabId === active.id &&
    shell.markerTabIds.length === 1 && shell.markerTabIds[0] === target.id);
  captures.agentThreeTabs = await captureShellWindow(
    browser, artifacts, "19-bsf3-three-tabs-target.png", await inspectShell(browser),
  );

  if (!manager.shellCommands.isAgentInspectorOpen) {
    manager.shellCommands.toggleAgentInspector();
  }
  await waitForQa(() => Boolean(manager.shellCommands.inspectorWebContents()),
    "the Agent Inspector for projection QA");
  await waitForQa(async () => (await inspectInspector(manager)).activityCount === 3,
    "the bounded Agent activity list");
  const inspector = await inspectInspector(manager);
  captures.agentProjectionInspection = { inspector, shell };
  expect("BSF3-05 repeated projections stay singular with three recent activities",
    shell.capsuleCount === 1 && shell.markerCount === 1 &&
    inspector.rootCount === 1 && inspector.liveRegionCount === 1 &&
    inspector.activityCount === 3);

  await setBrowserWindow(browser, 1180, 820, 1);
  await waitForQa(async () => (await inspectInspector(manager)).mode === "overlay",
    "the wide floating Agent Inspector");
  const wide = await inspectLayout(input);
  captures.agentInspectorWide = await captureAgentInspector(
    manager.shellCommands.inspectorWebContents()!, artifacts,
    "20-bsf3-inspector-floating-wide.png",
  );
  await setBrowserWindow(browser, 900, 680, 1);
  await waitForQa(async () => (await inspectInspector(manager)).mode === "overlay",
    "the narrow floating Agent Inspector");
  const narrow = await inspectLayout(input);
  captures.agentInspectorLayouts = { narrow, wide };
  captures.agentInspectorNarrow = await captureAgentInspector(
    manager.shellCommands.inspectorWebContents()!, artifacts,
    "21-bsf3-inspector-floating-narrow.png",
  );

  let commandCount = 0;
  manager.agentStatus.onCommand(() => { commandCount += 1; });
  active.navigate(`${fixture.baseUrl}/agent-spoof`);
  await waitForQa(async () => active.view.webContents.executeJavaScript(
    "document.body?.dataset.spoofDone === 'true'", true,
  ) as Promise<boolean>, "the untrusted Agent spoof page");
  const spoof = await active.view.webContents.executeJavaScript(
    "globalThis.__agentSpoof", true,
  ) as Record<string, string>;
  expect("BSF3-06 untrusted page cannot reach Browser Shell Agent commands",
    commandCount === 0 && Object.values(spoof).every((value) => value === "undefined"));
  captures.agentSpoof = await captureActivePage(
    tabs, artifacts, "22-bsf3-agent-spoof-page.png",
  );

  const explicitFocus = await closeInspectorExplicitly(browser, manager);
  manager.shellCommands.toggleAgentInspector();
  await focusInspector(manager);
  manager.agentStatus.clear();
  await waitForQa(() => !manager.shellCommands.isAgentInspectorOpen &&
    active.view.webContents.isFocused(), "Inspector auto-close page focus");
  expect("BSF3-07 Inspector closes to the capsule and auto-closes to the page",
    explicitFocus && active.view.webContents.isFocused());
  expect("BSF3-08 floating Inspector never changes the page bounds",
    wide.passed && narrow.passed);

  for (const tab of [...tabs.allTabs()]) {
    if (tab.id !== original.id) tabs.closeTab(tab.id);
  }
  tabs.select(original.id);
  await setBrowserWindow(browser, 1180, 820, 1);
  return captures;
}

function recentActivity(origin: string): BrowserAgentProjectionFacts["activity"] {
  const codes = ["task_event", "action_succeeded", "policy_requires_user",
    "action_partial", "action_failed"] as const;
  return codes.map((code, index) => ({
    kind: index % 2 === 0 ? "event" as const : "receipt" as const,
    code, actionKind: "observe" as const, origin,
    occurredAt: new Date(Date.now() + index * 1_000).toISOString(),
  }));
}

async function inspectAgentShell(browser: BrowserWindow): Promise<{
  activeTabId: string | null; capsuleCount: number; markerCount: number;
  markerTabIds: string[]; tabCount: number;
}> {
  return browser.webContents.executeJavaScript(`(() => {
    const markers = [...document.querySelectorAll('.agent-tab-marker')];
    return {
      activeTabId: document.querySelector('[role=tab][aria-selected=true]')?.dataset.tabId ?? null,
      capsuleCount: document.querySelectorAll('.agent-capsule').length,
      markerCount: markers.length,
      markerTabIds: markers.map((marker) => marker.closest('.tab-item')
        ?.querySelector('.tab-activation')?.dataset.tabId).filter(Boolean),
      tabCount: document.querySelectorAll('[role=tab]').length,
    };
  })()`, true) as Promise<any>;
}

async function inspectInspector(manager: BrowserWindowManager): Promise<{
  activityCount: number; height: number; liveRegionCount: number;
  mode: "docked" | "overlay" | null; rootCount: number; width: number;
}> {
  return manager.shellCommands.inspectorWebContents()!.executeJavaScript(`(() => ({
    activityCount: document.querySelectorAll('.activity-list li').length,
    height: document.documentElement.clientHeight,
    liveRegionCount: document.querySelectorAll('[aria-live]').length,
    mode: document.querySelector('.mode-docked') ? 'docked' :
      document.querySelector('.mode-overlay') ? 'overlay' : null,
    rootCount: document.querySelectorAll('.agent-inspector').length,
    width: document.documentElement.clientWidth,
  }))()`, true) as Promise<any>;
}

async function inspectLayout(input: {
  browser: BrowserWindow; manager: BrowserWindowManager;
}): Promise<{
  chromeHeight: number; inspector: Awaited<ReturnType<typeof inspectInspector>>;
  pageBounds: Electron.Rectangle; passed: boolean;
  window: { height: number; width: number };
}> {
  const { browser, manager } = input;
  const view = await inspectInspector(manager);
  const [width = 0, height = 0] = browser.getContentSize();
  const chrome = manager.tabs!.chromeHeightDip;
  const page = manager.tabs!.activeTab()!.view.getBounds();
  const expectedViewWidth = 396;
  const expectedViewHeight = height - chrome - 8;
  const passed = page.x === 0 && page.y === chrome && page.width === width &&
    page.height === height - chrome && view.width === expectedViewWidth &&
    Math.abs(view.height - expectedViewHeight) <= 1;
  return {
    chromeHeight: chrome, inspector: view, pageBounds: page, passed,
    window: { height, width },
  };
}

async function closeInspectorExplicitly(
  browser: BrowserWindow, manager: BrowserWindowManager,
): Promise<boolean> {
  await focusInspector(manager);
  const contents = manager.shellCommands.inspectorWebContents()!;
  contents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await waitForQa(async () => !manager.shellCommands.isAgentInspectorOpen &&
    browser.webContents.executeJavaScript(
      "document.activeElement?.classList.contains('agent-capsule') === true", true,
    ) as Promise<boolean>, "explicit Inspector close capsule focus");
  return browser.webContents.executeJavaScript(
    "document.activeElement?.classList.contains('agent-capsule') === true", true,
  ) as Promise<boolean>;
}

async function focusInspector(manager: BrowserWindowManager): Promise<void> {
  const contents = manager.shellCommands.inspectorWebContents()!;
  contents.focus();
  await waitForQa(() => contents.isFocused(), "Agent Inspector focus");
}

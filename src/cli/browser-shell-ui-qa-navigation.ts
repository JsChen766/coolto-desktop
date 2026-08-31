import type { BrowserWindow } from "electron";

import type { BrowserWindowManager } from "../desktop/main/browser/browser-window-manager.js";
import {
  captureActivePage,
  captureShellWindow,
  inspectShell,
  setBrowserWindow,
} from "./browser-shell-ui-qa-capture.js";
import type { BrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

type Expect = (name: string, passed: boolean) => void;

export async function runBrowserShellNavigation(input: {
  artifacts: string;
  browser: BrowserWindow;
  expect: Expect;
  fixture: BrowserShellFixture;
  manager: BrowserWindowManager;
}): Promise<Record<string, unknown>> {
  const { artifacts, browser, expect, fixture, manager } = input;
  const captures: Record<string, unknown> = {};
  manager.navigate(`${fixture.baseUrl}/`);
  await waitForQa(() => Boolean(manager.tabs?.activeTab()?.getState().faviconUrl),
    "fixture favicon");
  const faviconState = manager.tabs!.activeTab()!.getState();
  expect("09 favicon is projected into Browser Shell state",
    faviconState.faviconUrl?.startsWith(fixture.baseUrl) === true);
  expect("10 HTTP origin is explicitly presented as not secure",
    (await inspectShell(browser)).siteIdentityLabel === "不安全");
  captures.favicon = await captureShellWindow(
    browser, artifacts, "10-favicon.png", await inspectShell(browser),
  );

  manager.navigate(`${fixture.baseUrl}/redirect`);
  await waitForQa(() => manager.tabs?.activeTab()?.getState().url === `${fixture.baseUrl}/`,
    "same-origin redirect");
  expect("11 redirect settles on the real destination URL",
    manager.tabs?.activeTab()?.getState().url === `${fixture.baseUrl}/`);

  manager.navigate("https://example.com/");
  await waitForQa(() => {
    const state = manager.tabs?.activeTab()?.getState();
    return state?.url?.startsWith("https://example.com") === true && !state.isLoading;
  }, "real HTTPS navigation");
  const httpsShell = await inspectShell(browser);
  expect("12 real HTTPS navigation uses neutral site information",
    httpsShell.siteIdentityLabel === "站点信息");
  captures.https = await captureShellWindow(
    browser, artifacts, "11-real-https.png", httpsShell,
  );

  manager.navigate(`${fixture.baseUrl}/slow`);
  await waitForQa(() => manager.tabs?.activeTab()?.getState().isLoading === true,
    "slow navigation loading state");
  const loadingShell = await inspectShell(browser);
  expect("13 loading swaps reload for stop and shows progress",
    loadingShell.buttonLabels.includes("停止加载") && loadingShell.progressVisible);
  captures.loading = await captureShellWindow(
    browser, artifacts, "12-loading-stop.png", loadingShell,
  );
  manager.stopLoading();
  await waitForQa(() => manager.tabs?.activeTab()?.getState().isLoading === false,
    "stopped navigation");

  manager.navigate("http://127.0.0.1:65534/bsf1-unreachable");
  await waitForQa(() => Boolean(manager.tabs?.activeTab()?.getState().failure),
    "branded navigation failure");
  const failureState = manager.tabs!.activeTab()!.getState();
  expect("14 failed navigation retains the real URL and local error state",
    failureState.loadPhase === "failed" &&
    failureState.url?.includes("127.0.0.1:65534") === true);
  captures.failureShell = await captureShellWindow(
    browser, artifacts, "13-failure-shell.png", await inspectShell(browser),
  );
  captures.failurePage = await captureActivePage(
    manager.tabs!, artifacts, "14-failure-page.png",
  );

  manager.navigate("http://coolto-bsf1.invalid/");
  await waitForQa(() => Boolean(manager.tabs?.activeTab()?.getState().failure),
    "DNS failure page", 30_000);
  expect("15 invalid DNS resolves to a truthful failure state",
    manager.tabs?.activeTab()?.getState().failure?.code === -105);
  await verifyOffline(manager, fixture.baseUrl, expect);

  manager.navigate(`${fixture.baseUrl}/permission`);
  await waitForQa(async () => (await inspectShell(browser)).hasPermissionNotice,
    "permission denial notice");
  const permissionShell = await inspectShell(browser);
  expect("17 permission requests are denied with a visible explanation",
    permissionShell.hasPermissionNotice && permissionShell.buttonLabels.includes("关闭提示"));
  captures.permission = await captureShellWindow(
    browser, artifacts, "15-permission-denied.png", permissionShell,
  );
  await setBrowserWindow(browser, 720, 520, 1);
  const narrowPermission = await inspectShell(browser);
  expect("18 permission notice stays bounded at minimum width",
    narrowPermission.scrollWidth === narrowPermission.clientWidth);
  captures.permissionNarrow = await captureShellWindow(
    browser, artifacts, "16-permission-denied-720.png", narrowPermission,
  );
  manager.dismissPermissionNotice();
  await waitForQa(async () => !(await inspectShell(browser)).hasPermissionNotice,
    "dismissed permission notice");

  await setBrowserWindow(browser, 1180, 820, 1);
  const lastTab = manager.tabs?.activeTab();
  if (!lastTab) throw new Error("last Browser tab is unavailable");
  manager.tabs?.closeTab(lastTab.id);
  await waitForQa(() => browser.isDestroyed(), "last tab to close Browser Window");
  captures.lastTabClosed = { windowClosed: true };
  expect("19 closing the last tab closes Browser Window", browser.isDestroyed());
  return captures;
}

async function verifyOffline(
  manager: BrowserWindowManager, baseUrl: string, expect: Expect,
): Promise<void> {
  const debug = manager.tabs!.activeTab()!.view.webContents.debugger;
  const owned = !debug.isAttached();
  if (owned) debug.attach("1.3");
  try {
    await debug.sendCommand("Network.enable");
    await emulateOffline(debug, true);
    manager.navigate(`${baseUrl}/?offline=${Date.now()}`);
    await waitForQa(() => Boolean(manager.tabs?.activeTab()?.getState().failure),
      "offline failure page");
    expect("16 Electron offline mode reaches a truthful failure state",
      manager.tabs?.activeTab()?.getState().failure?.code === -106);
  } finally {
    await emulateOffline(debug, false).catch(() => {});
    if (owned && debug.isAttached()) debug.detach();
  }
}

function emulateOffline(
  debug: Electron.Debugger, offline: boolean,
): Promise<unknown> {
  return debug.sendCommand("Network.emulateNetworkConditions", {
    downloadThroughput: 0, latency: 0, offline, uploadThroughput: 0,
  });
}

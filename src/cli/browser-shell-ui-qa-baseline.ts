import type { BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BrowserWindowManager } from "../desktop/main/browser/browser-window-manager.js";
import {
  captureActivePage,
  captureShellWindow,
  inspectShell,
  readShellAxTree,
  setBrowserWindow,
} from "./browser-shell-ui-qa-capture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

type Expect = (name: string, passed: boolean) => void;

export async function runBrowserShellBaseline(input: {
  artifacts: string;
  browser: BrowserWindow;
  expect: Expect;
  manager: BrowserWindowManager;
}): Promise<Record<string, unknown>> {
  const { artifacts, browser, expect, manager } = input;
  const captures: Record<string, unknown> = {};
  await waitForQa(() => Boolean(manager.tabs?.hasTabs()), "the first browser tab");
  await waitForQa(async () => Boolean(await inspectShell(browser).catch(() => undefined)),
    "the Browser Shell renderer");
  await waitForQa(async () => Boolean(await manager.tabs?.activeTab()?.view.webContents
    .executeJavaScript("document.body?.innerText.includes('Coolto')", true)),
  "the Browser home page");
  expect("01 Browser Shell creates one isolated home tab",
    manager.tabs?.allTabs().length === 1);

  await setBrowserWindow(browser, 1180, 820, 1);
  const light = await inspectShell(browser);
  expect("02 light shell exposes address and navigation controls",
    light.tabCount === 1 && light.buttonLabels.includes("刷新"));
  captures.light = await captureShellWindow(
    browser, artifacts, "01-light-1180.png", light,
  );
  captures.homeLight = await captureActivePage(
    manager.tabs!, artifacts, "07-home-page-light.png",
  );

  manager.open({ theme: "dark" });
  await waitForQa(async () => (await inspectShell(browser)).colorScheme === "dark",
    "dark theme state");
  await waitForQa(async () => manager.tabs?.activeTab()?.view.webContents
    .executeJavaScript(
      "getComputedStyle(document.documentElement).colorScheme === 'dark'", true,
    ) as Promise<boolean>, "dark home page state");
  const dark = await inspectShell(browser);
  expect("03 dark theme reaches the real shell", dark.colorScheme === "dark");
  captures.dark = await captureShellWindow(
    browser, artifacts, "02-dark-1180.png", dark,
  );
  captures.homeDark = await captureActivePage(
    manager.tabs!, artifacts, "08-home-page-under-dark-shell.png",
  );
  expect("04 home page capture is non-empty",
    captureText(captures.homeLight).includes("Coolto"));
  expect("05 home page follows the Browser Shell dark theme",
    captureScheme(captures.homeDark) === "dark");

  manager.open({ theme: "light" });
  manager.agentStatus.set({
    taskId: "browser-shell-qa-task",
    goal: "读取测试页面并报告结果",
    status: "running",
    control: "agent",
    message: "正在观察当前页面",
    updatedAt: new Date().toISOString(),
  });
  await waitForQa(async () => (await inspectShell(browser)).hasAgentBar,
    "the current Agent bar");
  const agent = await inspectShell(browser);
  expect("06 Agent baseline exposes pause takeover and stop", [
    "暂停", "我来操作", "停止",
  ].every((label) => agent.buttonLabels.includes(label)));
  captures.agent = await captureShellWindow(
    browser, artifacts, "03-agent-running-1180.png", agent,
  );

  await setBrowserWindow(browser, 940, 680, 1);
  captures.narrow = await captureShellWindow(
    browser, artifacts, "04-agent-940.png", await inspectShell(browser),
  );
  await setBrowserWindow(browser, 720, 520, 1);
  captures.minimum = await captureShellWindow(
    browser, artifacts, "05-agent-720.png", await inspectShell(browser),
  );
  await setBrowserWindow(browser, 720, 520, 2);
  const zoomed = await inspectShell(browser);
  captures.zoom200 = await captureShellWindow(
    browser, artifacts, "06-agent-720-zoom-200.png", zoomed,
  );
  expect("07 baseline records the current 200 percent overflow state",
    Number.isFinite(zoomed.scrollWidth) && Number.isFinite(zoomed.clientWidth));

  await setBrowserWindow(browser, 1180, 820, 1);
  const axTree = await readShellAxTree(browser);
  await writeFile(join(artifacts, "ax-tree.json"),
    JSON.stringify(axTree, null, 2), "utf8");
  expect("08 Browser Shell AX tree is non-empty", axTree.length > 0);
  return captures;
}

function captureText(value: unknown): string {
  return String((value as { inspection?: { text?: string } })
    .inspection?.text ?? "");
}

function captureScheme(value: unknown): string {
  return String((value as { inspection?: { colorScheme?: string } })
    .inspection?.colorScheme ?? "");
}

import type { BrowserWindow } from "electron";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { BrowserWindowManager } from "../desktop/main/browser/browser-window-manager.js";
import {
  captureActivePage,
  captureAgentInspector,
  captureShellWindow,
  inspectShell,
  readShellAxTree,
  setBrowserWindow,
} from "./browser-shell-ui-qa-capture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";
import { browserAgentQaView } from "./browser-agent-qa-fixture.js";

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
    light.tabCount === 1 && light.buttonLabels.includes("刷新") && light.newTabAdjacent);
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
  expect("BSF3-00 idle Shell has no Agent capsule or Inspector",
    !light.hasAgentBar && !dark.hasAgentBar &&
    manager.shellCommands.inspectorWebContents() === undefined);

  manager.open({ theme: "light" });
  const targetTabId = manager.tabs?.activeTab()?.id ?? null;
  manager.agentStatus.setProjection({
    taskId: "browser-shell-qa-task",
    conversationId: "browser-shell-qa-conversation",
    state: browserAgentQaView({
      currentAction: {
        kind: "observe", impact: "read", targetOrigin: "http://127.0.0.1",
        targetTabId, startedAt: new Date().toISOString(),
      },
    }),
  });
  await waitForQa(async () => (await inspectShell(browser)).hasAgentBar,
    "the current Agent capsule");
  manager.shellCommands.toggleAgentInspector();
  let inspectorButtons: string[] = [];
  await waitForQa(async () => {
    inspectorButtons = await manager.shellCommands.inspectorWebContents()
      ?.executeJavaScript(`[...document.querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label') || button.textContent?.trim() || '')`, true)
      .catch(() => []) as string[] | undefined ?? [];
    return inspectorButtons.length > 0;
  }, "the Agent Inspector controls");
  const agent = await inspectShell(browser);
  expect("06 Agent baseline exposes pause takeover and stop", [
    "暂停", "我来操作", "停止",
  ].every((label) => inspectorButtons.some((value) => value.includes(label))));
  expect("BSF3-01 Capsule Inspector and target marker share one projection",
    agent.hasAgentBar && agent.agentTargetCount === 1);
  const inspectorContents = manager.shellCommands.inspectorWebContents()!;
  const inspectorUrl = inspectorContents.getURL();
  await inspectorContents.executeJavaScript(`(() => {
    const link = document.createElement('a');
    link.href = 'https://example.com/inspector-navigation-must-be-blocked';
    document.body.append(link);
    link.click();
    link.remove();
  })()`, true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect("BSF3-02 Inspector blocks in-document external navigation",
    inspectorContents.getURL() === inspectorUrl);
  captures.agent = await captureShellWindow(
    browser, artifacts, "03-agent-running-1180.png", agent,
  );
  captures.agentInspector = await captureAgentInspector(
    manager.shellCommands.inspectorWebContents()!, artifacts,
    "03-agent-inspector-1180.png",
  );

  await setBrowserWindow(browser, 940, 680, 1);
  captures.narrow = await captureShellWindow(
    browser, artifacts, "04-agent-940.png", await inspectShell(browser),
  );
  await setBrowserWindow(browser, 720, 520, 1);
  captures.minimum = await captureShellWindow(
    browser, artifacts, "05-agent-720.png", await inspectShell(browser),
  );
  captures.minimumInspector = await captureAgentInspector(
    manager.shellCommands.inspectorWebContents()!, artifacts,
    "05-agent-inspector-720.png",
  );
  await setBrowserWindow(browser, 720, 520, 2);
  const zoomed = await inspectShell(browser);
  const zoomedInspector = await inspectAgentInspector(manager);
  captures.zoom200 = await captureShellWindow(
    browser, artifacts, "06-agent-720-zoom-200.png", zoomed,
  );
  captures.zoom200InspectorImage = await captureAgentInspector(
    manager.shellCommands.inspectorWebContents()!, artifacts,
    "06-agent-inspector-720-zoom-200.png",
  );
  captures.zoom200Inspector = zoomedInspector;
  expect("07 baseline records the current 200 percent overflow state",
    Number.isFinite(zoomed.scrollWidth) && zoomed.scrollWidth <= zoomed.clientWidth);
  expect("BSF3-03 Inspector controls remain reachable at 720px and 200 percent",
    zoomedInspector.noHorizontalOverflow && zoomedInspector.requiredButtonsVisible);

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

async function inspectAgentInspector(
  manager: BrowserWindowManager,
): Promise<{ noHorizontalOverflow: boolean; requiredButtonsVisible: boolean }> {
  const contents = manager.shellCommands.inspectorWebContents();
  if (!contents) return { noHorizontalOverflow: false, requiredButtonsVisible: false };
  return contents.executeJavaScript(`(() => {
    const root = document.documentElement;
    const required = ['关闭任务详情', '暂停任务', '我来操作', '打开完整任务', '停止任务'];
    const buttons = [...document.querySelectorAll('button')];
    const visible = required.every((label) => {
      const button = buttons.find((item) =>
        (item.getAttribute('aria-label') || item.textContent || '').includes(label));
      if (!button) return false;
      const rect = button.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= root.clientWidth &&
        rect.top >= 0 && rect.bottom <= root.clientHeight;
    });
    return {
      noHorizontalOverflow: root.scrollWidth <= root.clientWidth,
      requiredButtonsVisible: visible,
    };
  })()`, true) as Promise<{
    noHorizontalOverflow: boolean;
    requiredButtonsVisible: boolean;
  }>;
}

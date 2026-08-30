import { app, BrowserWindow, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";

import { registerBrowserIpc } from "../desktop/main/browser/browser-ipc.js";
import { runBrowserShellAgentQa } from "./browser-shell-ui-qa-agent.js";
import { runBrowserShellBaseline } from "./browser-shell-ui-qa-baseline.js";
import { runBrowserShellBsf4Qa } from "./browser-shell-ui-qa-bsf4.js";
import { runBrowserShellBsf4Hardening } from
  "./browser-shell-ui-qa-bsf4-hardening.js";
import { runBrowserShellOverlayQa } from "./browser-shell-ui-qa-overlay.js";
import { runBrowserShellEfficiency } from "./browser-shell-ui-qa-efficiency.js";
import { startBrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { runBrowserShellNavigation } from "./browser-shell-ui-qa-navigation.js";
import { runBrowserShellWindows } from "./browser-shell-ui-qa-windows.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

interface Check { name: string; passed: boolean }

const checks: Check[] = [];
const captures: Record<string, unknown> = {};
const artifacts = requiredEnv("COOLTO_BROWSER_SHELL_QA_ARTIFACTS");
const suiteVersion = "bsf4-v2";
const keepAlive = setInterval(() => {}, 1_000);

function expect(name: string, passed: boolean): void {
  checks.push({ name, passed });
  if (!passed) throw new Error(`QA failed: ${name}`);
}

app.whenReady().then(async () => {
  const main = new BrowserWindow({ show: false });
  const manager = registerBrowserIpc(ipcMain, main);
  const fixture = await startBrowserShellFixture();
  const shellMessages: string[] = [];
  app.once("browser-window-created", (_event, window) => {
    window.webContents.on("console-message", (details) => {
      shellMessages.push(`console:${details.message.slice(0, 500)}`);
    });
    window.webContents.on("did-fail-load", (_event, code, description) => {
      shellMessages.push(`load:${code}:${description.slice(0, 200)}`);
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      shellMessages.push(`gone:${details.reason}:${details.exitCode}`);
    });
  });
  let browser: BrowserWindow | undefined;
  try {
    manager.open({ theme: "light" });
    browser = await waitForBrowserWindow(main);
    Object.assign(captures, await runBrowserShellBaseline({
      artifacts, browser, expect, manager,
    }));
    Object.assign(captures, await runBrowserShellAgentQa({
      artifacts, browser, expect, fixture, manager,
    }));
    Object.assign(captures, await runBrowserShellOverlayQa({
      artifacts, browser, expect, fixture, manager,
    }));
    Object.assign(captures, await runBrowserShellEfficiency({
      artifacts, browser, expect, fixture, manager,
    }));
    if (process.platform === "win32") {
      await runBrowserShellWindows({ browser, expect, fixture, manager });
    }
    Object.assign(captures, await runBrowserShellBsf4Qa({
      artifacts, browser, expect, fixture, main, manager,
    }));
    Object.assign(captures, await runBrowserShellBsf4Hardening({
      artifacts, browser, expect, fixture, manager,
    }));
    Object.assign(captures, await runBrowserShellNavigation({
      artifacts, browser, expect, fixture, manager,
    }));
    await report({
      suiteVersion,
      passed: checks.length,
      checks,
      captures,
      runtime: { electron: process.versions.electron, platform: process.platform },
    });
  } catch (error) {
    captures.failureDiagnostics = await diagnoseShell(browser, shellMessages);
    await report({
      suiteVersion,
      passed: checks.length,
      checks,
      captures,
      error: error instanceof Error ? error.stack : String(error),
    }).catch(() => {});
    throw error;
  } finally {
    manager.dispose();
    await fixture.close();
    if (browser && !browser.isDestroyed()) browser.destroy();
    if (!main.isDestroyed()) main.destroy();
    clearInterval(keepAlive);
    app.quit();
  }
}).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  clearInterval(keepAlive);
  app.exit(1);
});

async function waitForBrowserWindow(main: BrowserWindow): Promise<BrowserWindow> {
  let found: BrowserWindow | undefined;
  await waitForQa(() => {
    found = BrowserWindow.getAllWindows().find((window) => window !== main);
    return Boolean(found);
  }, "the Browser Window");
  return found!;
}

function report(value: unknown): Promise<void> {
  return writeFile(requiredEnv("COOLTO_BROWSER_SHELL_QA_REPORT"),
    JSON.stringify(value, null, 2), "utf8");
}

async function diagnoseShell(
  browser: BrowserWindow | undefined,
  messages: string[],
): Promise<unknown> {
  if (!browser || browser.isDestroyed()) return { messages };
  const renderer = await browser.webContents.executeJavaScript(`({
    api: typeof window.browserShell,
    body: document.body?.innerText?.slice(0, 500) ?? '',
    readyState: document.readyState,
    url: location.href
  })`, true).catch((error: unknown) => ({ error: String(error) }));
  return { messages, renderer };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

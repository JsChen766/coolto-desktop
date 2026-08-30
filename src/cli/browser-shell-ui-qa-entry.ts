import { app, BrowserWindow, ipcMain } from "electron";
import { writeFile } from "node:fs/promises";

import { registerBrowserIpc } from "../desktop/main/browser/browser-ipc.js";
import { runBrowserShellBaseline } from "./browser-shell-ui-qa-baseline.js";
import { startBrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { runBrowserShellNavigation } from "./browser-shell-ui-qa-navigation.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

interface Check { name: string; passed: boolean }

const checks: Check[] = [];
const captures: Record<string, unknown> = {};
const artifacts = requiredEnv("COOLTO_BROWSER_SHELL_QA_ARTIFACTS");
const keepAlive = setInterval(() => {}, 1_000);

function expect(name: string, passed: boolean): void {
  checks.push({ name, passed });
  if (!passed) throw new Error(`QA failed: ${name}`);
}

app.whenReady().then(async () => {
  const main = new BrowserWindow({ show: false });
  const manager = registerBrowserIpc(ipcMain, main);
  const fixture = await startBrowserShellFixture();
  let browser: BrowserWindow | undefined;
  try {
    manager.open({ theme: "light" });
    browser = await waitForBrowserWindow(main);
    Object.assign(captures, await runBrowserShellBaseline({
      artifacts, browser, expect, manager,
    }));
    Object.assign(captures, await runBrowserShellNavigation({
      artifacts, browser, expect, fixture, manager,
    }));
    await report({
      passed: checks.length,
      checks,
      captures,
      runtime: { electron: process.versions.electron, platform: process.platform },
    });
  } catch (error) {
    await report({
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

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

import { app, BrowserWindow, ipcMain } from "electron";

import { registerBrowserIpc } from "../desktop/main/browser/browser-ipc.js";
import { startBrowserShellFixture } from "./browser-shell-ui-qa-fixture.js";
import { waitForQa } from "./browser-shell-ui-qa-wait.js";

const keepAlive = setInterval(() => {}, 1_000);

app.whenReady().then(async () => {
  const main = new BrowserWindow({ show: false });
  const manager = registerBrowserIpc(ipcMain, main);
  const fixture = await startBrowserShellFixture();
  let finished = false;

  const finish = async (): Promise<void> => {
    if (finished) return;
    finished = true;
    manager.dispose();
    await fixture.close().catch(() => {});
    if (!main.isDestroyed()) main.destroy();
    clearInterval(keepAlive);
    app.quit();
  };

  try {
    manager.open({ theme: "light" });
    const browser = await waitForBrowserWindow(main);
    await waitForQa(() => Boolean(manager.tabs?.hasTabs()), "manual QA browser tab");
    const url = `${fixture.baseUrl}/efficiency-a`;
    manager.navigate(url);
    await waitForQa(() => {
      const state = manager.tabs?.activeTab()?.getState();
      return state?.url === url && !state.isLoading;
    }, "manual QA fixture");
    browser.setContentSize(940, 680);
    browser.setTitle("Coolto BSF2 Manual QA");
    browser.show();
    browser.focus();
    process.stdout.write(`COOLTO_BSF2_MANUAL_READY ${url}\n`);
    browser.once("closed", () => void finish());
  } catch (error) {
    await finish();
    throw error;
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
  }, "manual Browser Window");
  return found!;
}

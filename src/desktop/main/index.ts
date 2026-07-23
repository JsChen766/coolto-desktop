import { join } from "node:path";
import { writeFile } from "node:fs/promises";

import { app, BrowserWindow, ipcMain, shell } from "electron";

import { registerDesktopIpc } from "./ipc.js";

let mainWindow: BrowserWindow | undefined;

function createWindow(): void {
  const isMac = process.platform === "darwin";
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false,
    backgroundColor: "#fbfbfa",
    title: "Coolto",
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset",
          trafficLightPosition: { x: 14, y: 16 },
        }
      : { frame: false }),
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://") || url.startsWith("http://")) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const currentUrl = window.webContents.getURL();
    if (currentUrl && url !== currentUrl) {
      event.preventDefault();
    }
  });
  window.once("ready-to-show", () => {
    window.show();
    const screenshotPath = process.env.COOLTO_SCREENSHOT_PATH;
    if (screenshotPath) {
      const screenshotDelay = Number.parseInt(
        process.env.COOLTO_SCREENSHOT_DELAY ?? "1200",
        10,
      );
      setTimeout(() => {
        void window.webContents.capturePage().then(async (image) => {
          await writeFile(screenshotPath, image.toPNG());
          app.quit();
        });
      }, Number.isFinite(screenshotDelay) ? screenshotDelay : 1200);
    }
  });
  window.on("closed", () => {
    mainWindow = undefined;
  });

  registerDesktopIpc(ipcMain, window);
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow = window;
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

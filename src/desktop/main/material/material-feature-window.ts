import { join } from "node:path";

import { app, BrowserWindow, ipcMain } from "electron";

import { registerMaterialIpc, type MaterialIpcDependencies } from "./material-ipc.js";

export interface MaterialFeatureWindowOptions extends MaterialIpcDependencies {
  show?: boolean;
}

export function openMaterialFeatureWindow(options: MaterialFeatureWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    show: options.show ?? true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: preloadPath(),
    },
  });
  const unregister = registerMaterialIpc(ipcMain, options);
  window.once("closed", unregister);
  void window.loadFile(rendererPath());
  return window;
}

function rendererPath(): string {
  return app.isPackaged
    ? join(app.getAppPath(), "out", "renderer", "material-feature.html")
    : join(process.cwd(), "out", "renderer", "material-feature.html");
}

function preloadPath(): string {
  return app.isPackaged
    ? join(app.getAppPath(), "out", "preload", "material-feature.cjs")
    : join(process.cwd(), "out", "preload", "material-feature.cjs");
}

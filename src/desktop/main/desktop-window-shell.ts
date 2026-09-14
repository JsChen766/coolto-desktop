import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  Menu,
  Tray,
  app,
  nativeImage,
  type BrowserWindow,
} from "electron";

import {
  parseDesktopShellPrefs,
  type DesktopShellPrefs,
} from "./desktop-shell-prefs.js";

const TRAY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAADUlEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=",
  "base64",
);

export interface DesktopWindowShell {
  prefs(): DesktopShellPrefs;
  isQuitting(): boolean;
  setAlwaysOnTop(value: boolean): Promise<DesktopShellPrefs>;
  dispose(): void;
}

export function attachDesktopWindowShell(window: BrowserWindow): DesktopWindowShell {
  let prefs = parseDesktopShellPrefs(undefined);
  let quitting = false;
  const path = join(app.getPath("userData"), "desktop-shell.json");
  const tray = new Tray(nativeImage.createFromBuffer(TRAY_PNG));
  const show = (): void => {
    if (window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  };
  app.on("before-quit", () => {
    quitting = true;
  });
  tray.setToolTip("Coolto");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示主窗口", click: show },
    { label: "退出 Coolto", click: () => app.quit() },
  ]));
  tray.on("click", show);
  void loadPrefs(path).then((loaded) => {
    prefs = loaded;
    if (!window.isDestroyed()) window.setAlwaysOnTop(prefs.alwaysOnTop);
  });
  window.on("closed", () => tray.destroy());
  return {
    prefs: () => prefs,
    isQuitting: () => quitting,
    setAlwaysOnTop: async (value) => {
      prefs = { alwaysOnTop: value };
      if (!window.isDestroyed()) window.setAlwaysOnTop(value);
      await savePrefs(path, prefs);
      return prefs;
    },
    dispose: () => {
      if (!tray.isDestroyed()) tray.destroy();
    },
  };
}

async function loadPrefs(path: string): Promise<DesktopShellPrefs> {
  try {
    return parseDesktopShellPrefs(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return parseDesktopShellPrefs(undefined);
  }
}

async function savePrefs(path: string, prefs: DesktopShellPrefs): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(prefs)}\n`, "utf8");
}

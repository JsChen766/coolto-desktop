import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before, beforeEach, mock } from "node:test";

import type { BrowserWindow } from "electron";

import type { UserServicesResolver } from "../src/desktop/main/user-services.js";

// Drives the real WindowCloseGuard + desktop window shell + quit flush against
// a fake Electron that keeps the semantics these bugs depend on: before-quit
// can be prevented, a window that prevents its close cancels the in-progress
// quit, and window-all-closed only quits off macOS (as in index.ts).
type Platform = "win32" | "darwin";
type PreventableEvent = { preventDefault: () => void };

let platform: Platform = "win32";

class FakeApp extends EventEmitter {
  public readonly windows = new Set<FakeWindow>();
  public closingAll = false;
  public exited = false;

  public getPath(): string {
    return join(tmpdir(), "coolto-window-close-quit-flow-missing");
  }

  public quit(): void {
    if (this.exited) return;
    let prevented = false;
    this.emit("before-quit", { preventDefault: () => { prevented = true; } });
    if (prevented) return;
    this.closingAll = true;
    try {
      for (const window of [...this.windows]) {
        if (!window.attemptClose()) return;
      }
    } finally {
      this.closingAll = false;
    }
    this.exited = true;
  }
}

class FakeWindow extends EventEmitter {
  public destroyed = false;
  public visible = true;
  public readonly sent: string[] = [];
  public readonly webContents = {
    send: (channel: string) => { this.sent.push(channel); },
    isDestroyed: () => this.destroyed,
  };

  public constructor(private readonly owner: FakeApp) {
    super();
    owner.windows.add(this);
  }

  public close(): void {
    this.attemptClose();
  }

  public attemptClose(): boolean {
    if (this.destroyed) return true;
    let prevented = false;
    this.emit("close", { preventDefault: () => { prevented = true; } } satisfies PreventableEvent);
    if (prevented) return false;
    this.destroyed = true;
    this.visible = false;
    this.owner.windows.delete(this);
    this.emit("closed");
    if (this.owner.windows.size === 0 && !this.owner.closingAll) {
      this.owner.emit("window-all-closed");
    }
    return true;
  }

  public hide(): void { this.visible = false; }
  public show(): void { this.visible = true; }
  public isDestroyed(): boolean { return this.destroyed; }
  public isMinimized(): boolean { return false; }
  public restore(): void {}
  public focus(): void {}
  public setAlwaysOnTop(): void {}
}

class FakeTray {
  private destroyed = false;
  public setToolTip(): void {}
  public setContextMenu(): void {}
  public on(): void {}
  public destroy(): void { this.destroyed = true; }
  public isDestroyed(): boolean { return this.destroyed; }
}

const fakeApp = new FakeApp();
fakeApp.setMaxListeners(0); // each test attaches a fresh shell, as macOS activate does
fakeApp.on("window-all-closed", () => {
  if (platform !== "darwin") fakeApp.quit();
});
const dialogResponses: number[] = [];
const dialogButtons: string[][] = [];
let flushCalls = 0;

(globalThis as Record<string, unknown>).__cooltoElectronStub = {
  app: fakeApp,
  dialog: {
    showMessageBox: async (_window: unknown, options: { buttons: string[] }) => {
      dialogButtons.push(options.buttons);
      return { response: dialogResponses.shift() ?? 2 };
    },
  },
  Menu: { buildFromTemplate: (template: unknown) => template },
  Tray: FakeTray,
  nativeImage: { createFromBuffer: () => ({}) },
};
const stubSource = ["app", "dialog", "Menu", "Tray", "nativeImage"]
  .map((name) => `export const ${name} = globalThis.__cooltoElectronStub.${name};`)
  .join("\n");
const stubUrl = `data:text/javascript,${encodeURIComponent(stubSource)}`;
const hooks = `export async function resolve(specifier, context, next) {
  if (specifier === "electron") return { url: ${JSON.stringify(stubUrl)}, shortCircuit: true };
  return next(specifier, context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const { WindowCloseGuard } = await import("../src/desktop/main/window-close-guard.js");
const { attachDesktopWindowShell } = await import("../src/desktop/main/desktop-window-shell.js");
const { registerQuitFlush, resetQuitFlush, setPendingQuitFlush } = await import(
  "../src/desktop/main/quit-flush.js"
);

const services = {
  flushPending: async () => { flushCalls += 1; },
} as unknown as UserServicesResolver;
registerQuitFlush(services);

async function settle(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

// Mirrors the wiring in ipc.ts.
function openMainWindow() {
  const window = new FakeWindow(fakeApp);
  const browserWindow = window as unknown as BrowserWindow;
  const shell = attachDesktopWindowShell(browserWindow);
  const guard = new WindowCloseGuard(
    browserWindow,
    () => !shell.isQuitting(),
    () => shell.cancelQuit(),
  );
  window.on("close", () => {
    if (!shell.isQuitting()) return;
    setPendingQuitFlush(services.flushPending().catch(() => {}));
  });
  return { window, shell, guard };
}

// Quit with a dirty draft: the guard prevents the close, which cancels the quit.
async function quitIntoPrompt(response: number) {
  const opened = openMainWindow();
  opened.guard.report("dirty");
  dialogResponses.push(response);
  fakeApp.quit();
  await settle();
  assert.deepEqual(dialogButtons.at(-1), ["保存本地草稿并退出", "保留上次本地草稿并退出", "取消"]);
  return opened;
}

before(() => mock.timers.enable({ apis: ["setTimeout"] }));
after(() => mock.timers.reset());
beforeEach(() => {
  fakeApp.windows.clear();
  fakeApp.exited = false;
  dialogResponses.length = 0;
  flushCalls = 0;
  resetQuitFlush();
});

for (const os of ["win32", "darwin"] as const) {
  test(`${os}: cancelling the quit prompt restores close-to-tray and re-arms the flush`, async () => {
    platform = os;
    const { window, shell, guard } = await quitIntoPrompt(2);
    assert.equal(shell.isQuitting(), false);
    assert.equal(window.destroyed, false);
    guard.report("saved");
    window.close();
    assert.equal(window.destroyed, false, "close button must hide, not close");
    assert.equal(window.visible, false);
    assert.equal(fakeApp.exited, false);
    const flushesBefore = flushCalls;
    fakeApp.quit();
    await settle();
    // A fresh flushPending ran in before-quit (not the cancelled attempt's
    // stale snapshot), then the quit went through.
    assert.equal(flushCalls, flushesBefore + 2);
    assert.equal(fakeApp.exited, true);
    assert.equal(window.destroyed, true);
  });

  test(`${os}: a failed save in the quit prompt aborts the quit`, async () => {
    platform = os;
    const { window, shell, guard } = await quitIntoPrompt(0);
    assert.deepEqual(window.sent, ["window:save-before-close"]);
    guard.completeSave(false);
    assert.equal(shell.isQuitting(), false);
    dialogResponses.push(2);
    window.close();
    await settle();
    assert.deepEqual(dialogButtons.at(-1), [
      "保存本地草稿并关闭到托盘", "保留上次本地草稿并关闭到托盘", "取消",
    ]);
    assert.equal(window.destroyed, false);
    assert.equal(fakeApp.exited, false);
  });

  test(`${os}: 保存本地草稿并退出 quits the whole app`, async () => {
    platform = os;
    const { window, guard } = await quitIntoPrompt(0);
    assert.equal(fakeApp.exited, false);
    guard.completeSave(true);
    await settle();
    assert.equal(window.destroyed, true);
    assert.equal(fakeApp.exited, true);
  });

  test(`${os}: 保留上次本地草稿并退出 quits the whole app`, async () => {
    platform = os;
    const { window } = await quitIntoPrompt(1);
    await settle();
    assert.equal(window.destroyed, true);
    assert.equal(fakeApp.exited, true);
  });

  test(`${os}: saving from the close-to-tray prompt hides without quitting`, async () => {
    platform = os;
    const { window, guard } = openMainWindow();
    guard.report("dirty");
    dialogResponses.push(0);
    window.close();
    await settle();
    guard.completeSave(true);
    assert.equal(window.destroyed, false);
    assert.equal(window.visible, false);
    assert.equal(fakeApp.exited, false);
  });
}

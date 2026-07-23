import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  BrowserWindow,
  type IpcMain,
  type IpcMainEvent,
} from "electron";

import {
  RESUME_COMPILE_CHANNEL,
  RESUME_COMPILE_RESULT_CHANNEL,
  type ResumeCompileResponse,
  type ResumeCompileResult,
} from "../../resume/compiler-types.js";
import type { ResumeStructure } from "../../resume/types.js";

interface PendingCompile {
  resolve(result: ResumeCompileResult): void;
  reject(error: Error): void;
  timeout: ReturnType<typeof setTimeout>;
}

export class ElectronResumeCompilerService {
  readonly #ipcMain: IpcMain;
  readonly #pending = new Map<string, PendingCompile>();
  #window: BrowserWindow | undefined;
  #loadPromise: Promise<void> | undefined;

  public constructor(ipcMain: IpcMain) {
    this.#ipcMain = ipcMain;
    this.#ipcMain.on(
      RESUME_COMPILE_RESULT_CHANNEL,
      this.#handleCompileResponse,
    );
  }

  public async compile(
    structure: ResumeStructure,
    fixtureId?: string,
  ): Promise<ResumeCompileResult> {
    const window = await this.#ensureWindow();
    const requestId = randomUUID();
    const result = new Promise<ResumeCompileResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error("Resume Chromium compilation timed out"));
      }, 20_000);
      this.#pending.set(requestId, { resolve, reject, timeout });
    });
    window.webContents.send(RESUME_COMPILE_CHANNEL, {
      requestId,
      structure,
      ...(fixtureId ? { fixtureId } : {}),
    });
    return result;
  }

  public async printToPdf(): Promise<Buffer> {
    const window = await this.#ensureWindow();
    return window.webContents.printToPDF({
      pageSize: "A4",
      landscape: false,
      displayHeaderFooter: false,
      printBackground: true,
      scale: 1,
      margins: { marginType: "none" },
      preferCSSPageSize: true,
    });
  }

  public async capturePng(): Promise<Buffer> {
    const window = await this.#ensureWindow();
    return (await window.webContents.capturePage()).toPNG();
  }

  public dispose(): void {
    this.#ipcMain.removeListener(
      RESUME_COMPILE_RESULT_CHANNEL,
      this.#handleCompileResponse,
    );
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Resume compiler was disposed"));
    }
    this.#pending.clear();
    this.#window?.destroy();
    this.#window = undefined;
    this.#loadPromise = undefined;
  }

  readonly #handleCompileResponse = (
    event: IpcMainEvent,
    response: ResumeCompileResponse,
  ): void => {
    if (!this.#window || event.sender !== this.#window.webContents) return;
    const pending = this.#pending.get(response.requestId);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.#pending.delete(response.requestId);
    if (response.error) {
      pending.reject(new Error(response.error));
      return;
    }
    if (!response.result) {
      pending.reject(new Error("Resume renderer returned no compile result"));
      return;
    }
    pending.resolve(response.result);
  };

  async #ensureWindow(): Promise<BrowserWindow> {
    if (this.#window && !this.#window.isDestroyed()) {
      await this.#loadPromise;
      return this.#window;
    }
    const window = new BrowserWindow({
      width: 900,
      height: 1200,
      useContentSize: true,
      show: false,
      backgroundColor: "#ffffff",
      webPreferences: {
        preload: join(__dirname, "../preload/resume.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        partition: `resume-renderer-${process.pid}`,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, destination) => {
      const current = window.webContents.getURL();
      if (current && destination !== current) event.preventDefault();
    });
    if (!process.env.ELECTRON_RENDERER_URL) {
      window.webContents.session.webRequest.onBeforeRequest(
        { urls: ["http://*/*", "https://*/*"] },
        (_details, callback) => callback({ cancel: true }),
      );
    }
    this.#window = window;
    this.#loadPromise = process.env.ELECTRON_RENDERER_URL
      ? window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/resume.html`)
      : window.loadFile(join(__dirname, "../renderer/resume.html"));
    window.on("closed", () => {
      if (this.#window === window) {
        this.#window = undefined;
        this.#loadPromise = undefined;
      }
    });
    await this.#loadPromise;
    return window;
  }
}


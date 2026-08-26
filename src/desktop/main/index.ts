import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { app, BrowserWindow, ipcMain, shell } from "electron";

import { registerDesktopIpc } from "./ipc.js";
import { registerBrowserIpc } from "./browser/browser-ipc.js";
import { ElectronResumeCompilerService } from "./resume-compiler-service.js";
import { runResumeWorkspaceQa } from "./resume-workspace-qa.js";
import { getResumeFixture } from "../../resume/fixtures.js";
import { inspectResumePdf } from "../../resume/pdf-postflight.js";
import { runResumePdfExportQa } from "./resume-pdf-export-qa.js";
import { runResumePerformanceQa } from "./resume-performance-qa.js";
import { initializeNativeProtection } from "./native-protection.js";

let mainWindow: BrowserWindow | undefined;

// Production defaults: packaged builds must reach the production API and the
// Credit/LLM gateway. Development and custom deployments can still override
// via COOLTO_* environment variables (??= keeps an existing value).
if (app.isPackaged) {
  process.env.COOLTO_API_BASE_URL ??= "https://hkapi.coolto.com.cn";
  process.env.COOLTO_LLM_GATEWAY_BASE_URL ??= "https://credit.coolto.com.cn";
}

// Single instance: two processes writing the same conversation files corrupt
// each other's atomic saves (EPERM on rename); keep one instance and focus it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(bootstrap);
}

initializeNativeProtection();

function createWindow(): void {
  const isMac = process.platform === "darwin";
  const resumeCompiler = new ElectronResumeCompilerService(ipcMain);
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
      devTools: !app.isPackaged,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (
      url.startsWith("https://") ||
      (!app.isPackaged && url.startsWith("http://"))
    ) {
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
    const screenshotPath = app.isPackaged
      ? undefined
      : process.env.COOLTO_SCREENSHOT_PATH;
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
    resumeCompiler.dispose();
    mainWindow = undefined;
  });

  const browser = registerBrowserIpc(ipcMain, window);
  registerDesktopIpc(ipcMain, window, resumeCompiler, browser.agentController,
    browser.pageOperator, browser.agentStatus);
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
  mainWindow = window;
}

async function writeOutput(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

async function runResumeRendererQa(): Promise<void> {
  const compiler = new ElectronResumeCompilerService(ipcMain);
  try {
    const fixtureIds = (
      process.env.COOLTO_RESUME_QA_FIXTURES ??
      "zh-qualified,en-qualified,mixed-qualified,underfilled,tail-failure,overflow"
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const compileResults = [];
    for (const fixtureId of fixtureIds) {
      compileResults.push(
        await compiler.compile(getResumeFixture(fixtureId), fixtureId),
      );
    }

    const concurrentCompileResults = await Promise.all([
      compiler.compile(getResumeFixture("education-details-qualified"), "concurrent-qualified"),
      compiler.compile(getResumeFixture("tail-failure"), "concurrent-tail"),
    ]);

    const pdfFixtureId =
      process.env.COOLTO_RESUME_QA_PDF_FIXTURE ?? "zh-qualified";
    let pdfCompilation;
    try {
      pdfCompilation = await compiler.compileForPdf(
        getResumeFixture(pdfFixtureId),
        pdfFixtureId,
        Boolean(process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH),
      );
    } catch (error: unknown) {
      if (process.env.COOLTO_RESUME_QA_RESULT_PATH) {
        await writeOutput(
          process.env.COOLTO_RESUME_QA_RESULT_PATH,
          `${JSON.stringify({ compileResults, concurrentCompileResults, pdfError: String(error) }, null, 2)}\n`,
        );
      }
      throw error;
    }
    const pdfCompileResult = pdfCompilation.result;
    const pdf = pdfCompilation.pdf;
    const postflight = await inspectResumePdf(pdf);
    const workspaceResult = await runResumeWorkspaceQa(compiler);
    const g6ExportResult = process.env.COOLTO_RESUME_G6_EXPORT_PATH
      ? await runResumePdfExportQa(
          compiler,
          process.env.COOLTO_RESUME_G6_EXPORT_PATH,
        )
      : undefined;
    const result = {
      compileResults,
      concurrentCompileResults,
      pdfCompileResult,
      postflight,
      workspaceResult,
      ...(g6ExportResult ? { g6ExportResult } : {}),
    };

    if (process.env.COOLTO_RESUME_QA_RESULT_PATH) {
      await writeOutput(
        process.env.COOLTO_RESUME_QA_RESULT_PATH,
        `${JSON.stringify(result, null, 2)}\n`,
      );
    }
    if (process.env.COOLTO_RESUME_QA_PDF_PATH) {
      await writeOutput(process.env.COOLTO_RESUME_QA_PDF_PATH, pdf);
    }
    if (
      process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH &&
      pdfCompilation.screenshot
    ) {
      await writeOutput(
        process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH,
        pdfCompilation.screenshot,
      );
    }
    if (process.env.COOLTO_RESUME_QA_QUIET !== "1") {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    compiler.dispose();
  }
}

async function bootstrap(): Promise<void> {
  if (
    !app.isPackaged &&
    process.env.COOLTO_RESUME_PERFORMANCE_QA === "1"
  ) {
    try {
      await runResumePerformanceQa();
    } catch (error: unknown) {
      process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    } finally {
      app.quit();
    }
    return;
  }
  if (!app.isPackaged && process.env.COOLTO_RESUME_QA === "1") {
    try {
      await runResumeRendererQa();
    } catch (error: unknown) {
      process.stderr.write(
        `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    } finally {
      app.quit();
    }
    return;
  }

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

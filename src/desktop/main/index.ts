import { dirname, join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { app, BrowserWindow, ipcMain, shell } from "electron";

import { registerDesktopIpc } from "./ipc.js";
import { ElectronResumeCompilerService } from "./resume-compiler-service.js";
import { getResumeFixture } from "../../resume/fixtures.js";
import { inspectResumePdf } from "../../resume/pdf-postflight.js";

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

    const pdfFixtureId =
      process.env.COOLTO_RESUME_QA_PDF_FIXTURE ?? "zh-qualified";
    const pdfCompileResult = await compiler.compile(
      getResumeFixture(pdfFixtureId),
      pdfFixtureId,
    );
    const pdf = await compiler.printToPdf();
    const postflight = await inspectResumePdf(pdf);
    const result = { compileResults, pdfCompileResult, postflight };

    if (process.env.COOLTO_RESUME_QA_RESULT_PATH) {
      await writeOutput(
        process.env.COOLTO_RESUME_QA_RESULT_PATH,
        `${JSON.stringify(result, null, 2)}\n`,
      );
    }
    if (process.env.COOLTO_RESUME_QA_PDF_PATH) {
      await writeOutput(process.env.COOLTO_RESUME_QA_PDF_PATH, pdf);
    }
    if (process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH) {
      await writeOutput(
        process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH,
        await compiler.capturePng(),
      );
    }
    if (process.env.COOLTO_RESUME_QA_QUIET !== "1") {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    compiler.dispose();
  }
}

app.whenReady().then(async () => {
  if (process.env.COOLTO_RESUME_QA === "1") {
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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

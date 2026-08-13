import { app, ipcMain } from "electron";

import { ElectronResumeCompilerService } from "../desktop/main/resume-compiler-service.js";
import { runCli } from "./main.js";

/**
 * Electron CLI entry: runs the same CLI runtime but compiles every resume
 * draft through the real Chromium renderer (ElectronResumeCompilerService),
 * so the numbers the agent optimizes against are exactly what PDF export and
 * the desktop app measure. Requires `npm run desktop:build` once for the
 * renderer assets, same as pdf:export.
 *
 * Usage:
 *   electron out/cli/electron-main.cjs --auto-approve --attach <file> \
 *     --prompt-file <file> --dump-resume <out.json>
 */
app
  .whenReady()
  .then(async () => {
    const compiler = new ElectronResumeCompilerService(ipcMain);
    try {
      await runCli(compiler);
    } finally {
      compiler.dispose();
      app.quit();
    }
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`启动失败：${message}\n`);
    app.exit(1);
  });

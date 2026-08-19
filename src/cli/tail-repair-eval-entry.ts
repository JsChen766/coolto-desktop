import { app, BrowserWindow, ipcMain } from "electron";

import { runTailRepairEval } from "../../scripts/run-tail-repair-eval.js";
import { ElectronResumeCompilerService } from
  "../desktop/main/resume-compiler-service.js";

app.whenReady().then(async () => {
  const keepAlive = new BrowserWindow({ show: false });
  await keepAlive.loadURL("about:blank");
  const compiler = new ElectronResumeCompilerService(ipcMain);
  try {
    await runTailRepairEval(compiler);
  } finally {
    compiler.dispose();
    keepAlive.destroy();
    app.quit();
  }
}).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  app.exit(1);
});

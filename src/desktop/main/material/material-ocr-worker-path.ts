import { app } from "electron";
import { join } from "node:path";

export function resolveMaterialOcrWorkerEntryPath(): string {
  return app.isPackaged
    ? join(app.getAppPath(), "material-ocr-worker.cjs")
    : join(process.cwd(), "out", "main", "material-ocr-worker.cjs");
}

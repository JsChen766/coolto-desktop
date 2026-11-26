import { join } from "node:path";
import type { PlatformPath } from "node:path";

const WORKER_SEGMENTS = ["out", "main", "material-ocr-worker.cjs"] as const;

export interface MaterialOcrWorkerEntryPathInput {
  isPackaged: boolean;
  /** app.getAppPath(): `<resources>/app.asar` in packaged builds. */
  appPath: string;
  cwd: string;
  /** Injected only by tests to exercise win32/posix layouts on any host. */
  pathApi?: Pick<PlatformPath, "join">;
}

// The worker bundle keeps tesseract.js / pdfjs-dist / @napi-rs/canvas external,
// so it must run from inside app.asar (files: out/**) to resolve app.asar/node_modules.
export function resolveMaterialOcrWorkerEntryPath(input: MaterialOcrWorkerEntryPathInput): string {
  const joinPath = input.pathApi?.join ?? join;
  return input.isPackaged
    ? joinPath(input.appPath, ...WORKER_SEGMENTS)
    : joinPath(input.cwd, ...WORKER_SEGMENTS);
}

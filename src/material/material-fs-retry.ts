import { rename } from "node:fs/promises";

const WINDOWS_TRANSIENT_FS_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
/** ~1.5 s total: long enough for Defender/indexer handles, short of the 15 s root-lock wait of other contenders. */
export const MATERIAL_RENAME_RETRY_DELAYS_MS: readonly number[] = [25, 50, 100, 200, 400, 800];

export interface MaterialRenameDeps {
  rename: (from: string, to: string) => Promise<void>;
  platform: NodeJS.Platform;
  delays: readonly number[];
}

/** On Windows an AV/indexer handle on a freshly written file makes MoveFileEx fail with EPERM/EACCES/EBUSY for a moment. */
export function isWindowsTransientFsError(error: unknown, platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32" && WINDOWS_TRANSIENT_FS_CODES.has((error as NodeJS.ErrnoException)?.code ?? "");
}

/** A failed rename moves nothing, so retrying the same move is safe; other codes and platforms fail at once. */
export async function renameMaterialPath(from: string, to: string, deps: MaterialRenameDeps = { rename, platform: process.platform, delays: MATERIAL_RENAME_RETRY_DELAYS_MS }): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try { await deps.rename(from, to); return; }
    catch (error: unknown) {
      if (attempt >= deps.delays.length || !isWindowsTransientFsError(error, deps.platform)) throw error;
      await new Promise((resolve) => setTimeout(resolve, deps.delays[attempt]));
    }
  }
}

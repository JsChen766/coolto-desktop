import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type BrowserDownloadPathName = "downloads" | "userData";

/**
 * Picks the embedded browser's download folder without letting a missing OS
 * folder abort startup: Electron throws when the platform Downloads/Documents
 * folder cannot be resolved (e.g. relocated to an unplugged drive).
 */
export function resolveBrowserDownloadRoot(
  getPath: (name: BrowserDownloadPathName) => string,
  override?: string,
): string {
  if (override) return override;
  try {
    return getPath("downloads");
  } catch {
    return join(getPath("userData"), "downloads");
  }
}

/**
 * Best-effort creation of the download folder. A dangling junction/symlink or
 * an offline drive makes mkdir throw; the later download then ends as
 * "interrupted" instead of breaking IPC registration at startup.
 */
export function ensureBrowserDownloadRoot(
  root: string,
  mkdir: (path: string) => void = (path) => {
    mkdirSync(path, { recursive: true });
  },
): boolean {
  try {
    mkdir(root);
    return true;
  } catch {
    return false;
  }
}

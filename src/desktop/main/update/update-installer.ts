import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";

// vm（protect-main-bundle）中 dynamic import() 不可用，按需加载走 require。
const nodeRequire = createRequire(import.meta.url);

export interface ReplaceScriptInput {
  appPath: string;
  exePath: string;
  stagingDir: string;
  appName: string;
  zipName: string;
  /** Command used to relaunch the new app after replacement (tests stub it). */
  launchCommand?: string;
}

export interface ReplaceScriptResult {
  script: string;
  scriptPath: string;
}

/**
 * Locates the .app bundle from the running executable path
 * (<bundle>/Contents/MacOS/<name>).
 */
export function locateAppBundle(exePath: string): string {
  return posix.resolve(posix.dirname(exePath), "..", "..");
}

export function buildReplaceScript(
  input: ReplaceScriptInput,
): ReplaceScriptResult {
  const {
    appPath,
    exePath,
    stagingDir,
    appName,
    zipName,
    launchCommand = "open -n",
  } = input;
  const newApp = join(stagingDir, appName);
  const backup = join(stagingDir, "backup", appName);
  const scriptPath = join(stagingDir, "replace.sh");
  const script = [
    "#!/bin/bash",
    "set -u",
    `APP='${appPath}'`,
    `NEW_APP='${newApp}'`,
    `BACKUP='${backup}'`,
    `STAGED='${stagingDir}'`,
    "for i in 1 2 3 4 5 6 7 8 9 10; do",
    `  if ! pgrep -f '[${exePath.charAt(0)}]${escapeRegex(exePath.slice(1))}' >/dev/null 2>&1; then`,
    "    break",
    "  fi",
    "  sleep 1",
    "done",
    `mkdir -p "$STAGED/backup"`,
    'if [ -d "$APP" ]; then',
    '  if ! mv "$APP" "$BACKUP"; then',
    '    echo "backup-failed" > "$STAGED/replace.log"',
    "    exit 1",
    "  fi",
    "fi",
    'if [ ! -d "$NEW_APP" ]; then',
    '  if [ -d "$BACKUP" ]; then mv "$BACKUP" "$APP"; fi',
    '  echo "missing-new-app" > "$STAGED/replace.log"',
    "    exit 1",
    "fi",
    'if ! mv "$NEW_APP" "$APP"; then',
    '  if [ -d "$BACKUP" ]; then mv "$BACKUP" "$APP"; fi',
    '  echo "replace-failed" > "$STAGED/replace.log"',
    "    exit 1",
    "fi",
    'rm -rf "$STAGED/backup"',
    `rm -f "$STAGED/${zipName}" "$STAGED/replace.sh"`,
    'echo "ok" > "$STAGED/replace.log"',
    `${launchCommand} "$APP"`,
  ].join("\n");
  return { script, scriptPath };
}

/** Scans the staging root for a leftover backup from an interrupted update. */
export async function findPendingBackup(
  stagingRoot: string,
): Promise<string | null> {
  try {
    const entries = await readdir(stagingRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const backupDir = join(stagingRoot, entry.name, "backup");
      try {
        const contents = await readdir(backupDir);
        if (contents.some((name) => name.endsWith(".app"))) {
          return join(stagingRoot, entry.name);
        }
      } catch {
        // no backup in this staging entry
      }
    }
  } catch {
    // staging root missing or unreadable
  }
  return null;
}

export async function findAppBundleInStaging(
  stagingDir: string,
): Promise<string | null> {
  try {
    const entries = await readdir(stagingDir);
    const bundle = entries.find((name) => name.endsWith(".app"));
    return bundle ? join(stagingDir, bundle) : null;
  } catch {
    return null;
  }
}

/**
 * Writes the replacement script and dispatches it as a detached process that
 * survives the app quitting. Returns after the script is dispatched.
 */
export async function dispatchReplaceScript(
  input: ReplaceScriptInput,
): Promise<void> {
  const { script, scriptPath } = buildReplaceScript(input);
  await writeFile(scriptPath, script, { mode: 0o755 });
  const child = spawn("/bin/bash", [scriptPath], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}

/**
 * Recovers a backup left by an interrupted update: restores it over the app
 * bundle if the current bundle is missing, then cleans the staging entry.
 * Returns true when a recovery happened.
 */
export async function recoverPendingBackup(
  stagingRoot: string,
  appPath: string,
): Promise<boolean> {
  const staging = await findPendingBackup(stagingRoot);
  if (!staging) return false;
  const backupBundle = await findAppBundleInStaging(join(staging, "backup"));
  const currentMissing = await pathMissing(join(appPath, "Contents", "Info.plist"));
  if (currentMissing && backupBundle) {
    await rename(backupBundle, appPath);
  }
  await rm(staging, { recursive: true, force: true });
  return true;
}

async function pathMissing(filePath: string): Promise<boolean> {
  try {
    nodeRequire("node:fs/promises").access(filePath);
    return false;
  } catch {
    return true;
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

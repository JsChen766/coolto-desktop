import { spawn, spawnSync } from "node:child_process";
import { existsSync, openSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { findCooltoPage } from "./coolto-desktop-cdp.mjs";

export const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
export const driverRoot = join(repoRoot, "local-qa-data", "desktop-driver");
export const userDataDir = join(driverRoot, "user-data");
export const sessionPath = join(driverRoot, "session.json");
export const screenshotDir = join(driverRoot, "screenshots");

export const defaultDotEnvPath = resolve(repoRoot, "..", "..", "cv-agent-app", ".env");

export function readDotEnvFile(path = process.env.COOLTO_QA_DOTENV ?? defaultDotEnvPath) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value !== "") out[key] = value;
  }
  return out;
}

export function qaSpawnEnv(extra = {}) {
  const fromFile = readDotEnvFile();
  const merged = {
    ...process.env,
    ...fromFile,
    ...extra,
    ELECTRON_ENABLE_LOGGING: "1",
  };
  merged.COOLTO_API_BASE_URL =
    process.env.COOLTO_QA_API_BASE_URL?.trim() ||
    "http://127.0.0.1:8080";
  if (!merged.DEEPSEEK_API_KEY?.trim() && !merged.COOLTO_LLM_GATEWAY_BASE_URL?.trim()) {
    throw new Error(
      `QA dotenv missing DEEPSEEK_API_KEY or COOLTO_LLM_GATEWAY_BASE_URL (${defaultDotEnvPath})`,
    );
  }
  return merged;
}

export async function ensureDriverDirs() {
  await mkdir(userDataDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });
}

export async function readSession() {
  try {
    return JSON.parse(await readFile(sessionPath, "utf8"));
  } catch {
    return undefined;
  }
}

export async function writeSession(session) {
  await ensureDriverDirs();
  await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
  return session;
}

export function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function availablePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        rejectPort(new Error("Could not allocate a local CDP port"));
        return;
      }
      server.close(() => resolvePort(address.port));
    });
  });
}

export async function cdpReady(cdp, waitMs) {
  await findCooltoPage(cdp, waitMs);
  return true;
}

export function spawnDevApp(port) {
  const electronVite = resolve(repoRoot, "node_modules/electron-vite/bin/electron-vite.js");
  if (!existsSync(electronVite)) {
    throw new Error("electron-vite is missing; run npm install in this worktree");
  }
  return spawnDetached(process.execPath, [
    electronVite,
    "dev",
    "--remoteDebuggingPort",
    String(port),
    "--",
    `--user-data-dir=${userDataDir}`,
  ]);
}

export function spawnUnpackedApp(unpackedDir, port) {
  const executable = process.platform === "win32"
    ? join(unpackedDir, "Coolto.exe")
    : join(unpackedDir, "Coolto");
  if (!existsSync(executable)) {
    throw new Error(`Coolto executable not found: ${executable}`);
  }
  return spawnDetached(executable, [
    `--user-data-dir=${userDataDir}`,
    `--remote-debugging-port=${port}`,
  ]);
}

export async function stopSession(session) {
  if (session?.pid && isPidAlive(session.pid)) {
    if (process.platform === "win32") {
      spawnSync("taskkill.exe", ["/PID", String(session.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      try {
        process.kill(session.pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    await sleep(1_000);
  }
}

function spawnDetached(command, args) {
  const logPath = join(driverRoot, "electron.log");
  const logFd = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: qaSpawnEnv(),
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: false,
  });
  child.unref();
  return { pid: child.pid, logPath };
}

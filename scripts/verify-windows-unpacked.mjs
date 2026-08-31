import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

if (process.platform !== "win32") {
  throw new Error("The Windows unpacked smoke test requires Windows");
}

const appPath = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  throw new Error("Usage: verify-windows-unpacked <win-unpacked-path> [port]");
}
const port = process.argv[3] ? Number(process.argv[3]) : await availablePort();
const smokeRoot = await mkdtemp(join(tmpdir(), "coolto-unpacked-smoke-"));
const executable = join(appPath, "Coolto.exe");
const userData = join(smokeRoot, "user-data");
const marker = "COOLTO_MAIN_BOOTSTRAP_READY";
let application;

try {
  application = spawn(executable, [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
  ], {
    env: {
      ...process.env,
      COOLTO_INSTALLER_SMOKE: "1",
      ELECTRON_ENABLE_LOGGING: "1",
      ELECTRON_ENABLE_STACK_DUMPING: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  application.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
  application.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

  const deadline = Date.now() + 10_000;
  let cdpReady = false;
  while (Date.now() < deadline && application.exitCode === null) {
    cdpReady ||= await hasPageTarget(port);
    if (stdout.includes(marker) && cdpReady) break;
    await sleep(250);
  }
  const bootstrapReady = stdout.includes(marker);
  await sleep(3_000);
  const stillRunning = application.exitCode === null;
  const fatalStderr = /UnhandledPromiseRejection|uncaught exception/iu.test(stderr);
  const result = {
    bootstrapReady,
    cdpReady,
    stillRunning,
    fatalStderr,
    stderr: stderr.trim().slice(0, 2_000),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!bootstrapReady || !cdpReady || !stillRunning || fatalStderr) {
    throw new Error("Unpacked app failed bootstrap or CDP health checks");
  }
} finally {
  if (application?.pid && application.exitCode === null) {
    spawnSync("taskkill.exe", ["/PID", String(application.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    await sleep(1_000);
  }
  await rm(smokeRoot, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 250,
  });
}

async function hasPageTarget(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = await response.json();
    return targets.some((target) =>
      target.type === "page" && target.webSocketDebuggerUrl &&
      target.url?.startsWith("file:"),
    );
  } catch {
    return false;
  }
}

function availablePort() {
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

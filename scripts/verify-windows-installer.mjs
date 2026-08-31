import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";

if (process.platform !== "win32") {
  throw new Error("The Windows installer smoke test requires Windows");
}

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releaseDirectory = join(root, "dist-electron");
const installDirectory = join(releaseDirectory, "installer-smoke");
const installer = join(releaseDirectory, `Coolto-${packageJson.version}-x64.exe`);
const installedExe = join(installDirectory, "Coolto.exe");
const unpackedExe = join(releaseDirectory, "win-unpacked", "Coolto.exe");
const installedAsar = join(installDirectory, "resources", "app.asar");
const unpackedAsar = join(releaseDirectory, "win-unpacked", "resources", "app.asar");
const uninstaller = join(installDirectory, "Uninstall Coolto.exe");
const readyMarker = "COOLTO_MAIN_BOOTSTRAP_READY";
const bootstrapTimeoutMs = 30_000;
let application;

await access(installer);
await rm(installDirectory, { recursive: true, force: true });
try {
  await run(installer, ["/S", `/D=${installDirectory}`]);
  await Promise.all([access(installedExe), access(installedAsar), access(uninstaller)]);
  await assertSameFile(installedExe, unpackedExe);
  await assertSameFile(installedAsar, unpackedAsar);
  await delay(2_000);

  const port = await availablePort();
  application = spawn(installedExe, [
    `--user-data-dir=${join(installDirectory, "smoke-user-data")}`,
    `--remote-debugging-port=${port}`,
  ], {
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: "1",
      ELECTRON_ENABLE_STACK_DUMPING: "1",
      COOLTO_INSTALLER_SMOKE: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let stdout = "";
  let stderr = "";
  let spawnError;
  application.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  application.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  application.once("error", (error) => { spawnError = error; });
  const deadline = Date.now() + bootstrapTimeoutMs;
  let cdpReady = false;
  while (Date.now() < deadline && application.exitCode === null) {
    if (spawnError) throw spawnError;
    cdpReady ||= await hasPageTarget(port);
    if (stdout.includes(readyMarker) && cdpReady) break;
    await delay(250);
  }
  const bootstrapReady = stdout.includes(readyMarker);
  const fatalStderr = /UnhandledPromiseRejection|uncaught exception/iu.test(stderr);
  if (!bootstrapReady || !cdpReady || fatalStderr || application.exitCode !== null) {
    throw new Error(
      `Installed app did not become healthy ` +
      `(bootstrap=${bootstrapReady}, cdp=${cdpReady}, fatalStderr=${fatalStderr}, ` +
      `exit=${application.exitCode})` +
      `\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  }
  await delay(3_000);
  if (application.exitCode !== null) {
    throw new Error(`Installed app exited after bootstrap (${application.exitCode})`);
  }
  process.stdout.write("Installed Windows package completed bootstrap and remained healthy.\n");
} finally {
  if (application?.pid && application.exitCode === null) {
    await run("taskkill.exe", ["/PID", String(application.pid), "/T", "/F"], true);
  }
  try {
    await access(uninstaller);
    await run(uninstaller, ["/S", `_?=${installDirectory}`]);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rm(installDirectory, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 500,
  });
}

async function assertSameFile(left, right) {
  const [leftBytes, rightBytes] = await Promise.all([readFile(left), readFile(right)]);
  const leftHash = createHash("sha256").update(leftBytes).digest("hex");
  const rightHash = createHash("sha256").update(rightBytes).digest("hex");
  if (leftHash !== rightHash) throw new Error(`Installed file differs from package: ${left}`);
}

function run(command, args, allowFailure = false) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0 || allowFailure) resolveRun();
      else rejectRun(new Error(`${command} exited with code ${code}`));
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function hasPageTarget(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = await response.json();
    return targets.some((target) => target.type === "page" &&
      target.webSocketDebuggerUrl && target.url?.startsWith("file:"));
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

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readFile, rm } from "node:fs/promises";
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
let application;

await access(installer);
await rm(installDirectory, { recursive: true, force: true });
try {
  await run(installer, ["/S", `/D=${installDirectory}`]);
  await Promise.all([access(installedExe), access(installedAsar), access(uninstaller)]);
  await assertSameFile(installedExe, unpackedExe);
  await assertSameFile(installedAsar, unpackedAsar);
  await delay(2_000);

  application = spawn(installedExe, [
    `--user-data-dir=${join(installDirectory, "smoke-user-data")}`,
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
  let markReady;
  const ready = new Promise((resolveReady) => {
    markReady = resolveReady;
  });
  application.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
    if (stdout.includes(readyMarker)) markReady();
  });
  application.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  const earlyExit = new Promise((_, reject) => {
    application.once("exit", (code, signal) => {
      reject(
        new Error(
          `Installed app exited early (${code ?? signal})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
        ),
      );
    });
    application.once("error", reject);
  });
  const timeout = delay(10_000).then(() => {
    throw new Error(
      `Installed app did not finish bootstrap\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`,
    );
  });
  await Promise.race([ready, earlyExit, timeout]);
  await Promise.race([delay(3_000), earlyExit]);
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

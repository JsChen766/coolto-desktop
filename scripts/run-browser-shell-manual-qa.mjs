import electron from "electron";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

if (process.platform !== "win32") {
  throw new Error("Browser Shell manual QA currently targets Windows");
}

const userDataDirectory = await mkdtemp(join(tmpdir(), "coolto-bsf2-manual-"));
try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable");
  await run(process.execPath, [npmCli, "run", "desktop:build"]);
  await run(process.execPath, [
    resolve("node_modules/esbuild/bin/esbuild"),
    "src/cli/browser-shell-manual-qa-entry.ts", "--bundle", "--platform=node",
    "--format=cjs", "--external:electron",
    "--outfile=out/cli/browser-shell-manual-qa-entry.cjs",
  ]);
  const exitCode = await runElectron();
  if (exitCode !== 0) throw new Error(`Manual Browser Shell QA exited with ${exitCode}`);
} finally {
  await rm(userDataDirectory, { recursive: true, force: true });
}

function runElectron() {
  return new Promise((resolveExit, reject) => {
    const child = spawn(electron, [
      `--user-data-dir=${userDataDirectory}`,
      resolve("src/cli/browser-shell-manual-qa-app"),
    ], {
      cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(), env: process.env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolveRun()
      : reject(new Error(`${command} exited with ${code}`)));
  });
}

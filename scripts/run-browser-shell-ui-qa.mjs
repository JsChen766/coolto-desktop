import electron from "electron";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const artifactRoot = resolve("local-builds/functional-qa");
await mkdir(artifactRoot, { recursive: true });
const artifactDirectory = await mkdtemp(join(artifactRoot, "bsf1-browser-shell-"));
const userDataDirectory = await mkdtemp(join(tmpdir(), "coolto-bsf0-browser-shell-"));
const reportPath = join(artifactDirectory, "report.json");

try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable");
  await run(process.execPath, [npmCli, "run", "desktop:build"]);
  await run(process.execPath, [
    resolve("node_modules/esbuild/bin/esbuild"),
    "src/cli/browser-shell-ui-qa-entry.ts", "--bundle", "--platform=node",
    "--format=cjs", "--external:electron",
    "--outfile=out/cli/browser-shell-ui-qa-entry.cjs",
  ]);
  const exitCode = await runElectron();
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  process.stdout.write(`${JSON.stringify({
    ...report,
    artifactDirectory,
  }, null, 2)}\n`);
  if (exitCode !== 0 || report.error || report.passed < 19) {
    throw new Error(
      `Browser Shell UI QA 未通过：exit=${exitCode}, passed=${report.passed ?? 0}`,
    );
  }
} finally {
  await rm(userDataDirectory, { recursive: true, force: true });
}

function runElectron() {
  return new Promise((resolveExit, reject) => {
    const child = spawn(electron, [
      `--user-data-dir=${userDataDirectory}`,
      resolve("src/cli/browser-shell-ui-qa-app"),
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COOLTO_BROWSER_SHELL_QA_ARTIFACTS: artifactDirectory,
        COOLTO_BROWSER_SHELL_QA_REPORT: reportPath,
      },
      stdio: "inherit",
      windowsHide: true,
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

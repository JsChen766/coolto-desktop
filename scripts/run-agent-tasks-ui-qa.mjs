import electron from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "coolto-agent-tasks-ui-qa-"));
const reportPath = join(root, "report.json");
try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable");
  await run(process.execPath, [
    npmCli, "run", "desktop:build",
  ], { ...process.env, COOLTO_AGENT_TASKS_UI_QA: "1" });
  await run(process.execPath, [
    resolve("node_modules/esbuild/bin/esbuild"),
    "src/cli/agent-tasks-ui-qa-entry.ts", "--bundle", "--platform=node",
    "--format=cjs", "--external:electron",
    "--outfile=out/cli/agent-tasks-ui-qa-entry.cjs",
  ]);
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(electron, [
      `--user-data-dir=${join(root, "user-data")}`,
      resolve("src/cli/agent-tasks-ui-qa-app"),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, COOLTO_AGENT_TASKS_UI_QA_REPORT: reportPath },
      stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (exitCode !== 0 || report.error || report.passed < 12) {
    throw new Error(`Agent Tasks UI QA 未通过：exit=${exitCode}, passed=${report.passed ?? 0}`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function run(command, args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(), env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0
      ? resolveRun()
      : reject(new Error(`${command} exited with ${code}`)));
  });
}

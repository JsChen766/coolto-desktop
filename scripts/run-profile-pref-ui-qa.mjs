import electron from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "coolto-profile-pref-ui-qa-"));
const reportPath = join(root, "report.json");
try {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath is unavailable");
  await run(process.execPath, [npmCli, "run", "desktop:build"], {
    ...process.env,
    COOLTO_PROFILE_PREF_UI_QA: "1",
  });
  await run(process.execPath, [
    npmCli, "exec", "--", "esbuild",
    "src/cli/profile-pref-ui-qa-entry.ts", "--bundle", "--platform=node",
    "--format=cjs", "--external:electron",
    "--outfile=out/cli/profile-pref-ui-qa-entry.cjs",
  ]);
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(electron, [
      `--user-data-dir=${join(root, "user-data")}`,
      resolve("out/cli/profile-pref-ui-qa-entry.cjs"),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, COOLTO_PROFILE_PREF_UI_QA_REPORT: reportPath },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const minPassed = 13;
  if (exitCode !== 0 || report.error || (report.passed ?? 0) < minPassed) {
    throw new Error(`Profile/Pref UI QA 未通过：exit=${exitCode}, passed=${report.passed ?? 0}`);
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

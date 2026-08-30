import electron from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "coolto-agent-harness-qa-"));
const reportPath = join(root, "report.json");
try {
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(electron, [
      `--user-data-dir=${join(root, "user-data")}`,
      resolve("src/cli/agent-harness-qa-app"),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, COOLTO_AGENT_HARNESS_QA_REPORT: reportPath },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (exitCode !== 0 || report.error || report.passed < 10) {
    throw new Error(`Agent Harness QA 未通过：exit=${exitCode}, passed=${report.passed ?? 0}`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

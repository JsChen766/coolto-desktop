import electron from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "coolto-browser-qa-report-"));
const reportPath = join(root, "report.json");
try {
  const exitCode = await runElectron(
    resolve("src/cli/browser-agent-qa-app"),
    reportPath,
  );
  const report = await waitForFinalReport(reportPath, exitCode);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    exitCode !== 0 || report.error ||
    typeof report.passed !== "number" || report.passed < 20
  ) {
    throw new Error(
      `Browser Agent QA 未通过：exit=${exitCode}, passed=${report.passed ?? 0}`,
    );
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

async function waitForFinalReport(reportPath, exitCode) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 30_000) {
    try {
      const report = JSON.parse(await readFile(reportPath, "utf8"));
      if (typeof report.passed === "number" || report.error) return report;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Electron QA 未生成最终报告（exit=${exitCode}）：${lastError ?? "timeout"}`);
}

function runElectron(appRoot, reportPath) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(electron, [
      `--user-data-dir=${join(root, "user-data")}`,
      appRoot,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COOLTO_BROWSER_QA_REPORT: reportPath,
        COOLTO_BROWSER_QA_DOWNLOAD_ROOT: join(root, "downloads"),
      },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

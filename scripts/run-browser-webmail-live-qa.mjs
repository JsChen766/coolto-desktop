import electron from "electron";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const provider = process.env.COOLTO_WEBMAIL_LIVE_QA_PROVIDER;
if (provider !== "outlook" && provider !== "163") {
  throw new Error("COOLTO_WEBMAIL_LIVE_QA_PROVIDER 必须是 outlook 或 163");
}
const root = await mkdtemp(join(tmpdir(), "coolto-webmail-live-qa-"));
const reportPath = join(root, "report.json");
const profileRoot = join(tmpdir(), "coolto-webmail-live-qa-profile", provider);
try {
  const exitCode = await runElectron(reportPath);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (exitCode !== 0 || report.passed !== true) {
    throw new Error(`Browser Webmail live QA 未通过：exit=${exitCode}`);
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function runElectron(report) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(electron, [
      `--user-data-dir=${profileRoot}`,
      resolve("src/cli/browser-webmail-live-qa-app"),
    ], {
      cwd: process.cwd(),
      env: { ...process.env, COOLTO_WEBMAIL_LIVE_QA_REPORT: report },
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

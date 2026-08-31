import electron from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = await mkdtemp(join(tmpdir(), "coolto-browser-qa-report-"));
const reportPath = join(root, "report.json");
const suiteVersion = "bsf3-v1";
const requiredNames = [
  "01 initial tab exists",
  "01a Agent Capsule opens the canonical task Inspector",
  "01b Agent Inspector sends takeover command",
  "02 active tab is page 1",
  "03 DOM snapshot contains role",
  "04 AX snapshot exists",
  "05 screenshot is bounded",
  "05a Browser Webmail captures real page evidence",
  "05b Browser Webmail message dedupes",
  "06 semantic button query",
  "06a semantic query includes accessible labels",
  "07 same-origin frame query",
  "08 open shadow query",
  "09 wait for text",
  "10 wait for element",
  "11 nested/action elements tagged",
  "11a ARIA mail row is tagged and clickable",
  "11b transient target highlight precedes a semantic page action",
  "12 hover event applied",
  "13 drag/drop event applied",
  "14 keypress writes focused input",
  "14a submit click remains blocked",
  "14b Enter submit bypass remains blocked",
  "14c SubmissionIntent confirms fixture form",
  "14d SubmissionReceipt creates Tracker once",
  "15 new tab navigates",
  "16 tab list has two entries",
  "17 select tab changes active",
  "18 navigate reaches URL",
  "19 history back",
  "20 history forward",
  "21 reload settles",
  "22 close tab leaves one",
  "23 download completion is observed without path",
  "24 unsafe URL blocked",
  "25 ungranted control blocked",
];
try {
  const exitCode = await runElectron(
    resolve("src/cli/browser-agent-qa-app"),
    reportPath,
  );
  const report = await waitForFinalReport(reportPath, exitCode);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const results = Array.isArray(report.results) ? report.results : [];
  const complete = results.length === requiredNames.length && results.every(
    (result, index) => result?.passed === true && result?.name === requiredNames[index],
  );
  if (
    exitCode !== 0 || report.error || report.suiteVersion !== suiteVersion ||
    report.runtime?.platform !== process.platform || !complete
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

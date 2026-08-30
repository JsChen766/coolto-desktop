import electron from "electron";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const artifactRoot = resolve("local-builds/functional-qa");
await mkdir(artifactRoot, { recursive: true });
const artifactDirectory = await mkdtemp(join(artifactRoot, "bsf4-v2-browser-shell-"));
const userDataDirectory = await mkdtemp(join(tmpdir(), "coolto-bsf4-v2-browser-shell-"));
const reportPath = join(artifactDirectory, "report.json");
const suiteVersion = "bsf4-v2";
const electronTimeoutMs = 4 * 60 * 1000;
const requiredCheckNames = [
  "01 Browser Shell creates one isolated home tab",
  "02 light shell exposes address and navigation controls",
  "03 dark theme reaches the real shell",
  "04 home page capture is non-empty",
  "05 home page follows the Browser Shell dark theme",
  "BSF3-00 idle Shell has no Agent capsule or Inspector",
  "06 Agent baseline exposes pause takeover and stop",
  "BSF3-01 Capsule Inspector and target marker share one projection",
  "BSF3-02 Inspector blocks in-document external navigation",
  "07 baseline records the current 200 percent overflow state",
  "BSF3-03 Inspector controls remain reachable at 720px and 200 percent",
  "08 Browser Shell AX tree is non-empty",
  "BSF3-04 three tabs keep the Agent marker on the non-active target only",
  "BSF3-05 repeated projections stay singular with three recent activities",
  "BSF3-06 untrusted page cannot reach Browser Shell Agent commands",
  "BSF3-07 Inspector closes to the capsule and auto-closes to the page",
  "BSF3-08 Inspector keeps truthful docked and overlay page bounds",
  "BSF3-OVL-01 isolated host Overlay ignores main-world spoof",
  "BSF3-OVL-02 synthetic element click cannot approve a field",
  "BSF3-OVL-03 trusted mouse click approves only the intended field",
  "BSF3-OVL-04 light zh Overlay exposes expected DOM and computed style",
  "BSF3-OVL-05 offscreen badge hides and returns when scrolled into view",
  "BSF3-OVL-06 dark en Overlay exposes expected DOM and computed style",
  "BSF3-OVL-07 Overlay host CSS removal clears DOM padding and restores focus",
  "BSF2-01 page shortcut focuses the address bar without leaking L",
  "BSF2-02 Electron find reports count and both directions",
  "BSF2-03 find state stays isolated by tab",
  "BSF2-04 Escape closes find and returns focus to the page",
  "BSF2-05 same-origin zoom stays isolated and resettable",
  "BSF2-06 shell and page tab shortcuts create select cycle and close",
  "BSF2-07 twelve tabs stay bounded with visible overflow affordance",
  "BSF2-08 first middle and last tabs remain keyboard-reachable under stress",
  ...(process.platform === "win32" ? [
    "BSF2-WIN-01 Ctrl+R reloads and F5 retries the failed URL exactly once",
    "BSF2-WIN-02 Escape stops loading without failure or duplicate events",
    "BSF2-WIN-03 Alt+Left and Alt+Right traverse page history",
    "BSF2-WIN-04 common editing shortcuts stay in the page exactly once",
    "BSF2-WIN-05 Delete and middle click close only the intended tabs",
  ] : []),
  "BSF4-01 new tab has one clear idle action without fabricated data",
  "BSF4-02 new tab projects the current task from the existing bridge",
  "BSF4-03 waiting deep link is trusted and external pages cannot invoke it",
  "BSF4-03b trusted Chrome hands the current page to the App without starting a task",
  "BSF4-04 new tab remains actionable offline in dark English mode",
  "BSF4-05 concurrent same-name downloads expose real progress independently",
  "BSF4-06 download UI distinguishes complete cancel and interruption states",
  "BSF4-07 download records dismiss and Escape closes only the popover",
  "BSF4-08 Renderer download state never exposes an absolute local path",
  "BSF4-H01 timestamp-only projection preserves home input and Inspector focus",
  "BSF4-H02 Inspector uses 200/160ms motion and restores capsule focus",
  "BSF4-H03 download popover enters and restores the keyboard focus path",
  "BSF4-H04 dark English downloads fit 720px at 200 percent",
  "09 favicon is projected into Browser Shell state",
  "10 HTTP origin is explicitly presented as not secure",
  "11 redirect settles on the real destination URL",
  "12 real HTTPS navigation uses neutral site information",
  "13 loading swaps reload for stop and shows progress",
  "14 failed navigation retains the real URL and local error state",
  "15 invalid DNS resolves to a truthful failure state",
  "16 Electron offline mode reaches a truthful failure state",
  "17 permission requests are denied with a visible explanation",
  "18 permission notice stays bounded at minimum width",
  "19 closing the last tab closes Browser Window",
];

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
  const checks = Array.isArray(report.checks) ? report.checks : [];
  const complete = checks.length === requiredCheckNames.length &&
    checks.every((check, index) => check?.passed === true &&
      check?.name === requiredCheckNames[index]);
  if (exitCode !== 0 || report.error || report.suiteVersion !== suiteVersion ||
    report.runtime?.platform !== process.platform || !complete) {
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
        COOLTO_BROWSER_QA_DOWNLOAD_ROOT: join(userDataDirectory, "downloads"),
        COOLTO_BROWSER_SHELL_QA_REPORT: reportPath,
      },
      stdio: "inherit",
      windowsHide: true,
    });
    let settled = false;
    let timedOut = false;
    let killFallback;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (killFallback) clearTimeout(killFallback);
      callback();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
      killFallback = setTimeout(() => {
        child.unref();
        finish(() => resolveExit(124));
      }, 5_000);
    }, electronTimeoutMs);
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code) => finish(() => resolveExit(timedOut ? 124 : code ?? 1)));
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

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const NODE_SUITES = [
  {
    label: "C2 Mail / Inbox / Interview proposals",
    files: [
      "test/c2-mail-schedule-host-contract.test.ts",
      "test/inbox-application-proposal.test.ts",
      "test/inbox-interview-proposal.test.ts",
      "test/inbox-signal-controller.test.ts",
    ],
  },
  {
    label: "C2 SITE recruiting policy + form",
    files: [
      "test/recruiting-site-policy.test.ts",
      "test/recruiting-form-execution.test.ts",
      "test/recruiting-takeover-recovery.test.ts",
      "test/site-policy-registry.test.ts",
    ],
  },
  {
    label: "C2 CTX harness + managed tasks",
    files: [
      "test/agent-task-harness.test.ts",
      "test/managed-task-execution-state.test.ts",
      "test/be2-site-policy.test.ts",
    ],
  },
];

const ELECTRON_GATES = [
  { label: "Agent harness + encrypted mail (disk)", script: "qa:agent-harness" },
  { label: "Agent tasks / mail loop UI", script: "qa:agent-tasks-ui" },
  { label: "Browser SITE + managed apply", script: "qa:browser-agent" },
];

const MANUAL_C2 = [
  { id: "C2-mail-oauth", item: "真实 Gmail/Outlook 连接", reason: "需 COOLTO_*_OAUTH_CLIENT_ID" },
  { id: "C2-mail-loop", item: "设置里创建 mail_app_schedule 并启动", reason: "需登录 + 可选 OAuth" },
  { id: "C2-recruiting-live", item: "真站招聘表单", reason: "U — fixture 已由 qa:browser-agent 覆盖" },
  { id: "phase-2-deferred", item: "A3/A4/B2–B3/C4", reason: "见 phase-2-manual-test-checklist" },
];

function runNodeTests(files) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-reporter", "spec", ...files],
      { cwd: root, stdio: "inherit", env: process.env, windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolveRun() : reject(new Error(`exit ${code}`))));
  });
}

function runNpmScript(script) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) return Promise.reject(new Error("npm_execpath is unavailable"));
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [npmCli, "run", script], {
      cwd: root, env: process.env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolveRun() : reject(new Error(`${script} exit ${code}`))));
  });
}

process.stdout.write("Phase 4 C2 gates (MAIL / INTERVIEW / SITE / CTX)\n");
process.stdout.write("=".repeat(56) + "\n\n");

const allFiles = NODE_SUITES.flatMap((suite) => suite.files);
for (const suite of NODE_SUITES) {
  process.stdout.write(`▶ ${suite.label}\n`);
  for (const file of suite.files) process.stdout.write(`  - ${file}\n`);
}
process.stdout.write("\n");

try {
  await runNodeTests(allFiles);
  process.stdout.write("\n✓ C2 Node 合约/单测通过\n\n");
} catch (error) {
  process.stderr.write(`\n✗ C2 Node 失败: ${error instanceof Error ? error.message : error}\n\n`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  for (const gate of ELECTRON_GATES) {
    process.stdout.write(`▶ Electron: ${gate.label} (${gate.script})\n`);
    try {
      await runNpmScript(gate.script);
      process.stdout.write(`✓ ${gate.script} 通过\n\n`);
    } catch (error) {
      process.stderr.write(`\n✗ ${gate.script} 失败: ${error instanceof Error ? error.message : error}\n\n`);
      process.exitCode = 1;
      break;
    }
  }
}

if (!process.exitCode) {
  process.stdout.write("▶ Electron: inbox 审批卡 UI（扩展 phase-2 UI QA）\n");
  try {
    await runNpmScript("qa:phase-2:ui");
    process.stdout.write("✓ qa:phase-2:ui（含 C2 inbox 审批）通过\n\n");
  } catch (error) {
    process.stderr.write(`\n✗ qa:phase-2:ui 失败: ${error instanceof Error ? error.message : error}\n\n`);
    process.exitCode = 1;
  }
}

process.stdout.write("仍需手测：\n");
for (const row of MANUAL_C2) {
  process.stdout.write(`  [${row.id}] ${row.item} — ${row.reason}\n`);
}
process.stdout.write("\n清单: .cursor-pm/evidence/phase-4-manual-test-checklist.md\n");

if (process.exitCode) process.exit(process.exitCode);

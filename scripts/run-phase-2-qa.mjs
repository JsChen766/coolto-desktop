import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const AUTOMATED_SUITES = [
  {
    checklist: "A1/A2/C UI 合约",
    files: [
      "test/phase-2-checklist-automation.test.ts",
      "test/dialog-select-contract.test.ts",
      "test/preference-dialog-ui-contract.test.ts",
    ],
  },
  {
    checklist: "A1/A4 Profile 逻辑与同步映射",
    files: [
      "test/profile-dialog-controller.test.ts",
      "test/profile-form.test.ts",
      "test/profile-sync-contract.test.ts",
      "test/profile-sync-roundtrip.test.ts",
      "test/cli-profile-writer.test.ts",
      "test/profile-career-targets.test.ts",
    ],
  },
  {
    checklist: "A2 Preference 逻辑与 Outbox",
    files: [
      "test/preference-form.test.ts",
      "test/preference-app.test.ts",
    ],
  },
  {
    checklist: "B 材料库（部分回归）",
    files: [
      "test/material-product-navigation.test.ts",
      "test/material-core.test.ts",
    ],
  },
];

const MANUAL_ONLY = [
  { id: "A3-chat", item: "聊天区真实 Agent 审批流", reason: "UI QA 已点 fixture「接受并执行」" },
  { id: "A4-cold", item: "完全退出 App 冷启动", reason: "UI QA 用 sessionStorage + reload" },
  { id: "B2-B3", item: "材料导入/OCR 审阅", reason: "需真实文件与 OCR worker" },
  { id: "C4", item: "顶栏原生筛选下拉", reason: "未纳入 UI QA" },
];

const allFiles = AUTOMATED_SUITES.flatMap((suite) => suite.files);

function runTests(files) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "--test-reporter", "spec", ...files],
      { cwd: root, stdio: "inherit", env: process.env, windowsHide: true },
    );
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`测试退出码 ${code}`));
    });
  });
}

process.stdout.write("Phase 2 自动化 QA（worktree）\n");
process.stdout.write("=".repeat(56) + "\n\n");
for (const suite of AUTOMATED_SUITES) {
  process.stdout.write(`▶ ${suite.checklist}\n`);
  for (const file of suite.files) process.stdout.write(`  - ${file}\n`);
}
process.stdout.write("\n");

try {
  await runTests(allFiles);
  process.stdout.write("\n✓ Node 合约/单测全部通过\n\n");
} catch (error) {
  process.stderr.write(`\n✗ Node 自动化失败: ${error instanceof Error ? error.message : error}\n\n`);
  process.exitCode = 1;
}

if (!process.exitCode) {
  process.stdout.write("▶ Electron UI QA（Profile / Preference / 审批 / 材料库 fixture）\n");
  try {
    await runNodeScript("scripts/run-profile-pref-ui-qa.mjs");
    process.stdout.write("✓ Electron UI QA 通过\n\n");
  } catch (error) {
    process.stderr.write(`\n✗ Electron UI QA 失败: ${error instanceof Error ? error.message : error}\n\n`);
    process.exitCode = 1;
  }
}

process.stdout.write("仍需手测（脚本无法替代）：\n");
for (const row of MANUAL_ONLY) {
  process.stdout.write(`  [${row.id}] ${row.item} — ${row.reason}\n`);
}
process.stdout.write("\n手测清单: .cursor-pm/evidence/phase-2-manual-test-checklist.md\n");
process.stdout.write("（主仓路径；worktree 内文件相同）\n");

function runNodeScript(script) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: root, env: process.env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolveRun() : reject(new Error(`exit ${code}`)));
  });
}

if (process.exitCode) process.exit(process.exitCode);

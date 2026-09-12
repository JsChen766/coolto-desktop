import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultBeHandback = resolve(
  dirname(root),
  "prd-admin-analytics-handback-be/scripts/run-analytics-handback-db-acceptance.py",
);

/** @type {Array<{ id: string; label: string; files: string[]; manual?: string }>} */
const NODE_TIERS = [
  {
    id: "ANA",
    label: "ANA lifecycle / preference transport (App)",
    files: [
      "test/preference-signal-reader.test.ts",
      "test/agent-task-profile-preference-drift.test.ts",
      "test/stage-policy.test.ts",
      "test/preference-resolution.test.ts",
      "test/profile-sync-contract.test.ts",
    ],
    manual: "D₁ backend replay: COOLTO_C3_ANA_BACKEND=1（需 handback worktree + Docker）",
  },
  {
    id: "RES",
    label: "RES synthetic same-revision save/export (runtime acceptance)",
    files: [
      "test/resume-conversation-restorer.test.ts",
      "test/resume-source-snapshot.test.ts",
      "test/resume-quality.test.ts",
      "test/resume-publication-api.test.ts",
    ],
    manual: "真实模型 ≤600s + 云同 revision：COOLTO_C3_RES_RUNTIME=1 → run-resume-runtime-acceptance.mjs（U）",
  },
  {
    id: "DEL",
    label: "DEL fixture form / submission simulations",
    files: [
      "test/recruiting-form-execution.test.ts",
      "test/recruiting-takeover-recovery.test.ts",
      "test/application-submission.test.ts",
      "test/submission-receipt-recovery.test.ts",
    ],
    manual: "真站招聘表单仍为 U；浏览器链见 qa:phase-4-c2",
  },
  {
    id: "PRI",
    label: "PRI export / deletion / local clear",
    files: [
      "test/privacy-deletion-service.test.ts",
      "test/privacy-local-clear.test.ts",
      "test/privacy-service.test.ts",
      "test/privacy-export-crypto.test.ts",
      "test/privacy-origin-scope.test.ts",
    ],
    manual: "删除中断恢复、同意升级路径需 Electron 手测",
  },
  {
    id: "SCORE",
    label: "SCORE / resume quality signals (repo scope)",
    files: [
      "test/resume-quality.test.ts",
      "test/resume-normalizers.test.ts",
      "test/fact-neutral-resume-content.test.ts",
    ],
    manual: "校准集若扩到独立 pipeline，不在本 App gate 内",
  },
  {
    id: "PLAT",
    label: "PLAT browser AX / IME / observation bounds",
    files: [
      "test/browser-shortcut-policy.test.ts",
      "test/browser-accessibility-tagger.test.ts",
      "test/browser-agent-observation.test.ts",
      "test/privacy-ui-contract.test.ts",
    ],
    manual: "Windows 200% / 真机 IME / 浏览器崩溃恢复：phase-4-manual-test-checklist",
  },
  {
    id: "SIGNOFF",
    label: "Outbox boundary + cross-account isolation",
    files: [
      "test/application-write-boundary.test.ts",
      "test/application-sync-store.test.ts",
      "test/profile-proposal-service.test.ts",
      "test/material-product-repository.test.ts",
      "test/privacy-deletion-service.test.ts",
      "test/local-sync-recovery.test.ts",
    ],
  },
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

function runNodeScript(script, args = []) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root, env: process.env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolveRun() : reject(new Error(`exit ${code}`))));
  });
}

function runPython(script) {
  return new Promise((resolveRun, reject) => {
    const child = spawn("py", ["-3", script], {
      cwd: dirname(script), env: process.env, stdio: "inherit", windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolveRun() : reject(new Error(`py exit ${code}`))));
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

process.stdout.write("Phase 4 C3 — Tier2 longitudinal gates (incremental)\n");
process.stdout.write("=".repeat(56) + "\n\n");

const allFiles = [...new Set(NODE_TIERS.flatMap((tier) => tier.files))];
for (const tier of NODE_TIERS) {
  process.stdout.write(`▶ [${tier.id}] ${tier.label}\n`);
  for (const file of tier.files) process.stdout.write(`  - ${file}\n`);
  if (tier.manual) process.stdout.write(`  · manual/U: ${tier.manual}\n`);
}
process.stdout.write("\n");

try {
  await runNodeTests(allFiles);
  process.stdout.write("\n✓ C3 Tier2 Node 门禁通过\n\n");
} catch (error) {
  process.stderr.write(`\n✗ C3 Node 失败: ${error instanceof Error ? error.message : error}\n\n`);
  process.exitCode = 1;
}

if (!process.exitCode && process.env.COOLTO_C3_ANA_BACKEND === "1") {
  const script = process.env.COOLTO_BE_HANDACK_SCRIPT ?? defaultBeHandback;
  process.stdout.write(`▶ [ANA] Backend handback DB acceptance: ${script}\n`);
  if (!existsSync(script)) {
    process.stderr.write(`✗ 脚本不存在: ${script}\n`);
    process.exitCode = 1;
  } else {
    try {
      await runPython(script);
      process.stdout.write("✓ ANA backend acceptance 通过\n\n");
    } catch (error) {
      process.stderr.write(`✗ ANA backend: ${error instanceof Error ? error.message : error}\n\n`);
      process.exitCode = 1;
    }
  }
} else if (!process.exitCode) {
  process.stdout.write("⊘ ANA backend 未跑（设 COOLTO_C3_ANA_BACKEND=1 启用）\n\n");
}

if (!process.exitCode && process.env.COOLTO_C3_RES_RUNTIME === "1") {
  process.stdout.write("▶ [RES] Synthetic runtime acceptance (same-revision delivery)\n");
  try {
    await runNpmScript("desktop:build");
    await runNodeScript("scripts/run-resume-runtime-acceptance.mjs");
    process.stdout.write("✓ RES runtime acceptance 通过\n\n");
  } catch (error) {
    process.stderr.write(`✗ RES runtime: ${error instanceof Error ? error.message : error}\n\n`);
    process.exitCode = 1;
  }
} else if (!process.exitCode) {
  process.stdout.write("⊘ RES runtime acceptance 未跑（设 COOLTO_C3_RES_RUNTIME=1 启用）\n\n");
}

if (!process.exitCode) {
  process.stdout.write("建议串联：npm run qa:phase-4-c2（C2 宿主 + Browser）\n");
  process.stdout.write("证据：.cursor-pm/evidence/phase-4-c3-gates-*.md\n");
}

if (process.exitCode) process.exit(process.exitCode);

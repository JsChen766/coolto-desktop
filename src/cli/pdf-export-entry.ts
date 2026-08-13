import { app, ipcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ElectronResumeCompilerService } from "../desktop/main/resume-compiler-service.js";
import type { ResumeStructure } from "../resume/types.js";

interface CliPdfExportArgs {
  structure: string;
  out: string;
}

/**
 * Electron headless entry for CLI PDF export. Bundled to
 * out/cli/pdf-export-entry.cjs so the compiler service resolves
 * out/preload and out/renderer correctly. Requires `npm run desktop:build`
 * to have produced the renderer assets once.
 *
 * Usage:
 *   electron out/cli/pdf-export-entry.cjs --structure <resume.json> --out local-output/resume.pdf
 */
function parseArgs(argv: readonly string[]): CliPdfExportArgs {
  const args: CliPdfExportArgs = { structure: "", out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]!;
    if (current === "--structure") args.structure = argv[++index] ?? "";
    if (current === "--out") args.out = argv[++index] ?? "";
  }
  if (!args.structure || !args.out) {
    throw new Error(
      "Usage: pdf-export-entry.cjs --structure <resume.json> --out <output.pdf>",
    );
  }
  return args;
}

async function readStructure(path: string): Promise<ResumeStructure> {
  const raw = JSON.parse(await readFile(resolve(path), "utf8")) as
    | ResumeStructure
    | { structure: ResumeStructure };
  if ("structure" in raw && typeof raw.structure === "object") {
    return raw.structure as ResumeStructure;
  }
  return raw as ResumeStructure;
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const structure = await readStructure(args.structure);
  const service = new ElectronResumeCompilerService(ipcMain);
  try {
    const result = await service.compile(structure);
    // The product gate requires zero violations, but this CLI entry is a QA
    // viewer for dumps that may have been cut off by the generation budget.
    // bullet_tail_too_short is a cosmetic typography issue (last line below
    // the target ratio) and its host-side repair is evidence-bound, so it
    // cannot be applied to an offline dump; export with a warning instead of
    // refusing. All other violations (overflow, page geometry, ...) still
    // block the export.
    const tailOnly = result.violations.every(
      (violation) => violation.code === "bullet_tail_too_short",
    );
    if (!result.qualified && !tailOnly) {
      throw new Error(
        `未达标（usageRatio=${result.usageRatio.toFixed(3)}）：${result.violations
          .map((violation) => violation.code)
          .join("、")}`,
      );
    }
    if (!result.qualified) {
      process.stdout.write(
        `警告：存在 ${result.violations.length} 条尾行违规（usageRatio=${result.usageRatio.toFixed(3)}），仍按当前内容导出。\n`,
      );
    }
    const { pdf } = await service.compileForPdf(
      structure,
      undefined,
      false,
      !result.qualified,
    );
    const outputPath = resolve(args.out);
    await writeFile(outputPath, pdf);
    process.stdout.write(`PDF 已导出：${outputPath}\n`);
  } finally {
    service.dispose();
    app.quit();
  }
}

app.whenReady().then(run).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`PDF 导出失败：${message}\n`);
  app.exit(1);
});

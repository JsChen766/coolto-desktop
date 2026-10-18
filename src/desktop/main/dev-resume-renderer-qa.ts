import { dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { ipcMain } from "electron";

import { getResumeFixture } from "../../resume/fixtures.js";
import { inspectResumePdf } from "../../resume/pdf-postflight.js";
import { ElectronResumeCompilerService } from "./resume-compiler-service.js";
import { runResumePdfExportQa } from "./resume-pdf-export-qa.js";
import { runResumeWorkspaceQa } from "./resume-workspace-qa.js";

async function writeOutput(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

/** Unpackaged resume renderer QA entry used by `COOLTO_RESUME_QA=1`. */
export async function runResumeRendererQa(): Promise<void> {
  const compiler = new ElectronResumeCompilerService(ipcMain);
  try {
    const fixtureIds = (
      process.env.COOLTO_RESUME_QA_FIXTURES ??
      "zh-qualified,en-qualified,mixed-qualified,underfilled,tail-failure,overflow"
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const compileResults = [];
    for (const fixtureId of fixtureIds) {
      compileResults.push(
        await compiler.compile(getResumeFixture(fixtureId), fixtureId),
      );
    }

    const concurrentCompileResults = await Promise.all([
      compiler.compile(getResumeFixture("education-details-qualified"), "concurrent-qualified"),
      compiler.compile(getResumeFixture("tail-failure"), "concurrent-tail"),
    ]);

    const pdfFixtureId =
      process.env.COOLTO_RESUME_QA_PDF_FIXTURE ?? "zh-qualified";
    let pdfCompilation;
    try {
      pdfCompilation = await compiler.compileForPdf(
        getResumeFixture(pdfFixtureId),
        pdfFixtureId,
        Boolean(process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH),
      );
    } catch (error: unknown) {
      if (process.env.COOLTO_RESUME_QA_RESULT_PATH) {
        await writeOutput(
          process.env.COOLTO_RESUME_QA_RESULT_PATH,
          `${JSON.stringify({ compileResults, concurrentCompileResults, pdfError: String(error) }, null, 2)}\n`,
        );
      }
      throw error;
    }
    const pdfCompileResult = pdfCompilation.result;
    const pdf = pdfCompilation.pdf;
    const postflight = await inspectResumePdf(pdf);
    const workspaceResult = await runResumeWorkspaceQa(compiler);
    const g6ExportResult = process.env.COOLTO_RESUME_G6_EXPORT_PATH
      ? await runResumePdfExportQa(
          compiler,
          process.env.COOLTO_RESUME_G6_EXPORT_PATH,
        )
      : undefined;
    const result = {
      compileResults,
      concurrentCompileResults,
      pdfCompileResult,
      postflight,
      workspaceResult,
      ...(g6ExportResult ? { g6ExportResult } : {}),
    };

    if (process.env.COOLTO_RESUME_QA_RESULT_PATH) {
      await writeOutput(
        process.env.COOLTO_RESUME_QA_RESULT_PATH,
        `${JSON.stringify(result, null, 2)}\n`,
      );
    }
    if (process.env.COOLTO_RESUME_QA_PDF_PATH) {
      await writeOutput(process.env.COOLTO_RESUME_QA_PDF_PATH, pdf);
    }
    if (
      process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH &&
      pdfCompilation.screenshot
    ) {
      await writeOutput(
        process.env.COOLTO_RESUME_QA_SCREENSHOT_PATH,
        pdfCompilation.screenshot,
      );
    }
    if (process.env.COOLTO_RESUME_QA_QUIET !== "1") {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    compiler.dispose();
  }
}


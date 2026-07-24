import { sha256, stableStringify } from "../../resume/stable-snapshot.js";
import { getResumeFixture } from "../../resume/fixtures.js";
import type { ResumePdfCompiler } from "../../resume/export/types.js";
import { ResumePdfExportService } from "./resume-pdf-export-service.js";

export async function runResumePdfExportQa(
  compiler: ResumePdfCompiler,
  outputPath: string,
) {
  const structure = getResumeFixture("markdown-qualified");
  const compileResult = await compiler.compile(structure);
  const service = new ResumePdfExportService(
    compiler,
    { choosePath: async () => outputPath },
  );
  return service.exportPdf({
    proposalId: "g6-electron-qa",
    source: "candidate",
    title: "G6 Chromium QA",
    candidateId: "candidate-g6-qa",
    candidateRevision: 0,
    suggestedFilename: "g6-qualified-resume.pdf",
    structureHash: sha256(stableStringify(structure)),
    structure,
    compileResult,
  });
}

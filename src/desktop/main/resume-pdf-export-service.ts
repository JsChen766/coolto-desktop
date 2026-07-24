import { createHash } from "node:crypto";
import { basename, isAbsolute } from "node:path";

import { sha256, stableStringify } from "../../resume/stable-snapshot.js";
import { ResumePdfExportError } from "../../resume/export/errors.js";
import { verifyResumePdfIntegrity } from "../../resume/export/pdf-integrity.js";
import type { ResumePdfPostflightResult } from "../../resume/pdf-postflight.js";
import type {
  ResumePdfCompiler,
  ResumePdfExportApprovalPayload,
  ResumePdfExportGateway,
  ResumePdfExportResult,
} from "../../resume/export/types.js";
import { atomicWritePdf } from "./atomic-pdf-writer.js";

export interface ResumePdfSaveDialog {
  choosePath(suggestedFilename: string): Promise<string | undefined>;
}

export interface ResumePdfWriter {
  write(filePath: string, pdf: Uint8Array): Promise<void>;
}

export interface ResumePdfExportServiceOptions {
  writer?: ResumePdfWriter;
  verifyIntegrity?: (
    pdf: Uint8Array,
    structure: ResumePdfExportApprovalPayload["structure"],
  ) => Promise<ResumePdfPostflightResult>;
}

export class ResumePdfExportService implements ResumePdfExportGateway {
  private readonly writer: ResumePdfWriter;
  private readonly verifyIntegrity: NonNullable<
    ResumePdfExportServiceOptions["verifyIntegrity"]
  >;

  public constructor(
    private readonly compiler: ResumePdfCompiler,
    private readonly saveDialog: ResumePdfSaveDialog,
    options: ResumePdfExportServiceOptions = {},
  ) {
    this.writer = options.writer ?? { write: atomicWritePdf };
    this.verifyIntegrity = options.verifyIntegrity ?? verifyResumePdfIntegrity;
  }

  public async exportPdf(
    payload: ResumePdfExportApprovalPayload,
    signal?: AbortSignal,
  ): Promise<ResumePdfExportResult> {
    assertNotAborted(signal);
    const structure = structuredClone(payload.structure);
    const structureHash = sha256(stableStringify(structure));
    if (structureHash !== payload.structureHash) {
      throw new ResumePdfExportError(
        "resume_pdf_payload_changed",
        "Resume structure changed after PDF export approval.",
      );
    }
    const selectedPath = await this.saveDialog.choosePath(
      payload.suggestedFilename,
    );
    if (!selectedPath) return { status: "cancelled" };
    const filePath = normalizeSelectedPath(selectedPath);
    assertNotAborted(signal);
    const compilation = await this.compiler.compileForPdf(structure);
    assertCompileContract(compilation.result, payload);
    const postflight = await this.verifyIntegrity(
      compilation.pdf,
      structure,
    );
    assertNotAborted(signal);
    await this.writer.write(filePath, compilation.pdf);
    return {
      status: "exported",
      filePath,
      filename: basename(filePath),
      bytes: compilation.pdf.byteLength,
      sha256: createHash("sha256").update(compilation.pdf).digest("hex"),
      pageCount: postflight.pageCount,
      embeddedFontNames: postflight.embeddedFontNames,
    };
  }
}

function normalizeSelectedPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !isAbsolute(trimmed)) {
    throw new Error("PDF save dialog returned an invalid path");
  }
  return trimmed.toLocaleLowerCase().endsWith(".pdf")
    ? trimmed
    : `${trimmed}.pdf`;
}

function assertCompileContract(
  result: Awaited<ReturnType<ResumePdfCompiler["compile"]>>,
  payload: ResumePdfExportApprovalPayload,
): void {
  if (
    !result.qualified ||
    result.templateId !== payload.compileResult.templateId ||
    result.profileVersion !== payload.compileResult.profileVersion ||
    result.profileHash !== payload.compileResult.profileHash
  ) {
    throw new ResumePdfExportError(
      "resume_pdf_layout_failed",
      "Resume layout or template changed during PDF export.",
    );
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason ?? new Error("PDF export cancelled");
}

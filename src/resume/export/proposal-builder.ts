import { randomUUID } from "node:crypto";

import { sha256, stableStringify } from "../stable-snapshot.js";
import type { ResumeCompiler } from "../workspace/compiler-port.js";
import { ResumePdfExportError } from "./errors.js";
import { resumePdfFilename } from "./filename.js";
import { ResumePdfExportSourceResolver } from "./source-resolver.js";
import type {
  ResumePdfExportApprovalPayload,
  ResumePdfExportSourceInput,
} from "./types.js";

export interface ResumePdfExportProposalBuilderOptions {
  createProposalId?: () => string;
}

export class ResumePdfExportProposalBuilder {
  public constructor(
    private readonly resolver: ResumePdfExportSourceResolver,
    private readonly compiler: ResumeCompiler,
    private readonly options: ResumePdfExportProposalBuilderOptions = {},
  ) {}

  public async build(
    input: ResumePdfExportSourceInput,
    signal?: AbortSignal,
  ): Promise<ResumePdfExportApprovalPayload> {
    const source = await this.resolver.resolve(input, signal);
    const structure = structuredClone(source.structure);
    const compileResult = await this.compiler.compile(structure);
    if (!compileResult.qualified) {
      throw new ResumePdfExportError(
        "resume_pdf_layout_failed",
        `Resume failed Chromium export layout gates: ${compileResult.violations.map((item) => item.code).join(", ")}`,
      );
    }
    return {
      ...source,
      proposalId:
        this.options.createProposalId?.() ?? `resume-pdf-${randomUUID()}`,
      suggestedFilename: resumePdfFilename(source.title),
      structureHash: sha256(stableStringify(structure)),
      structure,
      compileResult: structuredClone(compileResult),
    };
  }
}

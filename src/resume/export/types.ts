import type { ResumeCompileResult } from "../compiler-types.js";
import type { ResumeStructure } from "../types.js";

export type ResumePdfExportSourceInput =
  | {
      source: "candidate";
      candidateId: string;
      expectedRevision: number;
      title: string;
    }
  | {
      source: "published";
      resumeId: string;
      title?: string;
    };

export interface ResolvedResumePdfSource {
  source: ResumePdfExportSourceInput["source"];
  title: string;
  structure: ResumeStructure;
  candidateId?: string;
  candidateRevision?: number;
  resumeId?: string;
  contentHash?: string;
}

export interface ResumePdfExportApprovalPayload
  extends Omit<ResolvedResumePdfSource, "structure"> {
  proposalId: string;
  suggestedFilename: string;
  structureHash: string;
  structure: ResumeStructure;
  compileResult: ResumeCompileResult;
}

export interface ResumePdfCompilation {
  result: ResumeCompileResult;
  pdf: Buffer;
}

export interface ResumePdfCompiler {
  compile(structure: ResumeStructure): Promise<ResumeCompileResult>;
  compileForPdf(structure: ResumeStructure): Promise<ResumePdfCompilation>;
}

export type ResumePdfExportResult =
  | { status: "cancelled" }
  | {
      status: "exported";
      filePath: string;
      filename: string;
      bytes: number;
      sha256: string;
      pageCount: number;
      embeddedFontNames: string[];
    };

export interface ResumePdfExportGateway {
  exportPdf(
    payload: ResumePdfExportApprovalPayload,
    signal?: AbortSignal,
  ): Promise<ResumePdfExportResult>;
}

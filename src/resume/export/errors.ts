export type ResumePdfExportErrorCode =
  | "candidate_not_exportable"
  | "published_resume_not_exportable"
  | "resume_pdf_layout_failed"
  | "resume_pdf_integrity_failed"
  | "resume_pdf_payload_changed";

export class ResumePdfExportError extends Error {
  public constructor(
    public readonly code: ResumePdfExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ResumePdfExportError";
  }
}

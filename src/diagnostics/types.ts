/** Core product actions that contributors may reconstruct from local diagnostics. */
export type LocalDiagnosticAction =
  | "app_start"
  | "experience_import"
  | "jd_import"
  | "match_analysis"
  | "resume_generation"
  | "resume_export"
  | "data_export"
  | "data_clear"
  | "managed_task";

export type LocalDiagnosticPhase =
  | "started"
  | "success"
  | "failure"
  | "cancelled"
  | "waiting_user";

export interface LocalDiagnosticEvent {
  schemaVersion: 1;
  id: string;
  at: string;
  action: LocalDiagnosticAction;
  phase: LocalDiagnosticPhase;
  /** Metadata only — never resume/experience bodies, keys, or absolute paths. */
  detail?: Record<string, string | number | boolean | null>;
}

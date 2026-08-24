export interface ToolCapabilityMetadataV1 {
  sideEffect: "read" | "reversible" | "external_commitment";
  risk: "R0" | "R1" | "R2" | "R3";
  requiredScopes: string[];
  concurrency: "parallel" | "sequential";
  idempotency: "none" | "request_key" | "receipt_reconcile";
  evidence: "none" | "action_receipt" | "submission_receipt";
  requiresFreshObservation: boolean;
  unattendedAllowed: boolean;
}

export interface HarnessToolResultV1<T> {
  status: "succeeded" | "partial" | "blocked" | "needs_user" | "uncertain";
  data: T | null;
  receiptId: string | null;
  errorCode: string | null;
  message: string;
}

export interface ActionTokenV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  runId: string;
  toolName: string;
  requestHash: string;
  grantHash: string;
  targetOrigin: string | null;
  tabId: string | null;
  observationHash: string | null;
  expiresAt: string;
  consumedAt: string | null;
  receiptId: string | null;
}

export interface ActionReceiptV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  runId: string;
  toolCallId: string;
  toolName: string;
  requestHash: string;
  targetOrigin: string | null;
  status: "succeeded" | "partial" | "blocked" | "uncertain" | "failed";
  observationBeforeHash: string | null;
  observationAfterHash: string | null;
  evidenceRefs: string[];
  proposalId: string | null;
  errorCode: string | null;
  createdAt: string;
}

export interface SubmissionIntentV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  runId: string;
  actionTokenId: string;
  applicationProposalId: string;
  jdId: string;
  resumeId: string;
  resumeContentHash: string;
  company: string;
  role: string;
  targetUrl: string;
  tabId: string;
  submitFillId: string;
  preparedAt: string;
  expiresAt: string;
  startedAt: string | null;
  submissionReceiptId: string | null;
}

export interface SubmissionReceiptV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  runId: string;
  intentId: string;
  actionReceiptId: string;
  jdId: string;
  resumeId: string;
  resumeContentHash: string;
  company: string;
  role: string;
  targetUrl: string;
  siteApplicationId: string | null;
  status: "confirmed" | "pending" | "failed";
  applicationId: string | null;
  createdAt: string;
}

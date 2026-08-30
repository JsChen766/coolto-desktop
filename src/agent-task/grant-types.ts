import type { JsonValue } from "./json-types.js";

export interface DelegationGrantV1 {
  version: 1;
  id: string;
  ownerId: string;
  taskId: string;
  taskGoalHash: string;
  allowedDomains: string[];
  blockedDomains: string[];
  allowedActions: string[];
  jobCriteria: Record<string, JsonValue>;
  assetPolicy: Record<string, JsonValue>;
  answerPolicy: Record<string, JsonValue>;
  connectorPolicy?: Record<string, JsonValue>;
  submissionBudget: Record<string, number | null>;
  unattended: boolean;
  validFrom: string;
  expiresAt: string;
  policyVersion: string;
  confirmedByUserAt: string;
  contentHash: string;
}

export interface GrantRevocationV1 {
  version: 1;
  grantId: string;
  ownerId: string;
  reason: "user" | "account_changed" | "policy_changed" | "security";
  revokedAt: string;
}

export interface PolicyDecisionV1 {
  version: 1;
  ownerId: string;
  taskId: string;
  runId: string;
  toolCallId: string;
  decision: "allow" | "block" | "ask";
  reasonCode: string;
  requestHash: string;
  grantId: string | null;
  grantHash: string | null;
  actionTokenId: string | null;
  decidedAt: string;
}

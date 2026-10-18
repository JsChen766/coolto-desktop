export const PRIVACY_POLICY_VERSION = "privacy-2026-10-18-v1" as const;

export type PrivacyConsentStatus =
  | "accepted"
  | "required"
  | "declined"
  | "withdrawn";

export interface PrivacyPolicyView {
  policyVersion: string;
  contentHash: string;
  effectiveAt: string;
  changeClass: "major" | "minor";
}

export interface PrivacyConsentView {
  policyVersion: string;
  status: PrivacyConsentStatus;
  acceptedAt: string | null;
  decisionAt: string | null;
}

export interface PrivacyConsentDecision {
  policyVersion: string;
  contentHash: string;
  decision: "accept" | "decline" | "withdraw";
  deviceId: string;
  appVersion: string;
}

export type ExportSnapshotMode =
  | "synchronized"
  | "local_pending"
  | "offline_stale";

export interface ExportSnapshotRequest {
  schemaVersion: 1;
  includeRevisionHistory: true;
}

export interface CloudExportSnapshotEntry {
  path: string;
  kind: string;
  bytes: number;
  sha256: string;
  protected: boolean;
  value: unknown;
}

export interface CloudExportRelationship {
  from: string;
  relation: string;
  to: string;
}

export interface CloudExportSnapshotV1 {
  schemaVersion: 1;
  snapshotId: string;
  capturedAt: string;
  policyVersion: string;
  accountScopeDigest: string;
  entries: CloudExportSnapshotEntry[];
  relationships: CloudExportRelationship[];
  counts: Record<string, number>;
  relationshipCount: number;
  relationshipSha256: string;
  rootSha256: string;
}

export type DeletionStatus =
  | "awaiting_control_ack"
  | "pending_deletion"
  | "processing"
  | "partial_failure"
  | "completed"
  | "failed";

export type DeletionStepStatus =
  | "pending"
  | "completed"
  | "failed"
  | "not_applicable";

export interface DeletionStepView {
  name: "cloud_assets" | "sync_history" | "identity" | "third_party_boundary";
  status: DeletionStepStatus;
  updatedAt: string;
  errorCode: string | null;
}

export interface DeletionRequestView {
  requestId: string;
  status: DeletionStatus;
  retryable: boolean;
  steps: DeletionStepView[];
  thirdPartyDataUnaffected: true;
  updatedAt: string;
  completedAt: string | null;
}

export interface DeletionStartResponse extends DeletionRequestView {
  deletionControlToken: string;
}

export interface DeletionAckResponse {
  requestId: string;
  status: "acknowledged";
}

export interface PrivacyRequester {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  requestControl<T>(path: string, token: string, init?: RequestInit): Promise<T>;
  getJson<T>(path: string, signal?: AbortSignal): Promise<T>;
  requestAckReplay<T>(
    path: string,
    idempotencyKey: string,
    init?: RequestInit,
  ): Promise<T>;
}

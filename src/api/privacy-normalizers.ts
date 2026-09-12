import { ApiContractError } from "./contract-values.js";
import type {
  CloudExportSnapshotV1,
  DeletionAckResponse,
  DeletionRequestView,
  DeletionStartResponse,
  PrivacyConsentView,
  PrivacyPolicyView,
} from "../privacy/types.js";

export function normalizePolicy(value: unknown): PrivacyPolicyView {
  const record = object(value, "privacy policy");
  const changeClass = string(record.changeClass, "policy.changeClass");
  if (changeClass !== "major" && changeClass !== "minor") {
    throw new ApiContractError("policy.changeClass has unsupported value");
  }
  return {
    policyVersion: string(record.policyVersion, "policy.policyVersion"),
    contentHash: string(record.contentHash, "policy.contentHash"),
    effectiveAt: string(record.effectiveAt, "policy.effectiveAt"),
    changeClass,
  };
}

export function normalizeConsent(value: unknown): PrivacyConsentView {
  const record = object(value, "privacy consent");
  const status = string(record.status, "consent.status");
  if (!("accepted|required|declined|withdrawn".split("|") as string[]).includes(status)) {
    throw new ApiContractError("consent.status has unsupported value");
  }
  return {
    policyVersion: string(record.policyVersion, "consent.policyVersion"),
    status: status as PrivacyConsentView["status"],
    acceptedAt: nullableString(record.acceptedAt, "consent.acceptedAt"),
    decisionAt: nullableString(record.decisionAt, "consent.decisionAt"),
  };
}

export function normalizeSnapshot(value: unknown): CloudExportSnapshotV1 {
  const record = object(value, "cloud export snapshot");
  if (record.schemaVersion !== 1) throw new ApiContractError("snapshot.schemaVersion must be 1");
  const entries = array(record.entries, "snapshot.entries").map((item) => {
    const entry = object(item, "snapshot.entry");
    const bytes = entry.bytes;
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes < 0) {
      throw new ApiContractError("snapshot.entry.bytes must be a non-negative integer");
    }
    if (typeof entry.protected !== "boolean") throw new ApiContractError("snapshot.entry.protected must be boolean");
    return {
      path: string(entry.path, "snapshot.entry.path"), kind: string(entry.kind, "snapshot.entry.kind"),
      bytes, sha256: string(entry.sha256, "snapshot.entry.sha256"),
      protected: entry.protected, value: entry.value,
    };
  });
  const relationships = array(record.relationships, "snapshot.relationships").map((item) => {
    const relation = object(item, "snapshot.relationship");
    return {
      from: string(relation.from, "relationship.from"),
      relation: string(relation.relation, "relationship.relation"),
      to: string(relation.to, "relationship.to"),
    };
  });
  return {
    schemaVersion: 1,
    snapshotId: string(record.snapshotId, "snapshot.snapshotId"),
    capturedAt: string(record.capturedAt, "snapshot.capturedAt"),
    policyVersion: string(record.policyVersion, "snapshot.policyVersion"),
    accountScopeDigest: string(record.accountScopeDigest, "snapshot.accountScopeDigest"),
    entries, relationships, counts: numberMap(record.counts, "snapshot.counts"),
    relationshipCount: integer(record.relationshipCount, "snapshot.relationshipCount"),
    relationshipSha256: string(record.relationshipSha256, "snapshot.relationshipSha256"),
    rootSha256: string(record.rootSha256, "snapshot.rootSha256"),
  };
}

export function normalizeDeletionStart(value: unknown): DeletionStartResponse {
  const record = object(value, "deletion start");
  return {
    ...normalizeDeletion(record),
    deletionControlToken: string(record.deletionControlToken, "deletionControlToken"),
  };
}

export function normalizeDeletion(value: unknown): DeletionRequestView {
  const record = object(value, "deletion request");
  const status = string(record.status, "deletion.status");
  const allowed = "awaiting_control_ack|pending_deletion|processing|partial_failure|completed|failed".split("|");
  if (!allowed.includes(status)) throw new ApiContractError("deletion.status has unsupported value");
  if (typeof record.retryable !== "boolean") throw new ApiContractError("deletion.retryable must be boolean");
  if (record.thirdPartyDataUnaffected !== true) throw new ApiContractError("deletion.thirdPartyDataUnaffected must be true");
  return {
    requestId: string(record.requestId, "deletion.requestId"),
    status: status as DeletionRequestView["status"],
    retryable: record.retryable,
    steps: array(record.steps, "deletion.steps").map(normalizeStep),
    thirdPartyDataUnaffected: true,
    updatedAt: string(record.updatedAt, "deletion.updatedAt"),
    completedAt: nullableString(record.completedAt, "deletion.completedAt"),
  };
}

export function normalizeAck(value: unknown): DeletionAckResponse {
  const record = object(value, "deletion acknowledgement");
  if (record.status !== "acknowledged") throw new ApiContractError("deletion acknowledgement status is invalid");
  return { requestId: string(record.requestId, "ack.requestId"), status: "acknowledged" };
}

function normalizeStep(value: unknown): DeletionRequestView["steps"][number] {
  const record = object(value, "deletion.step");
  const name = string(record.name, "deletion.step.name");
  const status = string(record.status, "deletion.step.status");
  if (!("cloud_assets|sync_history|identity|third_party_boundary".split("|") as string[]).includes(name)) throw new ApiContractError("deletion.step.name has unsupported value");
  if (!("pending|completed|failed|not_applicable".split("|") as string[]).includes(status)) throw new ApiContractError("deletion.step.status has unsupported value");
  return {
    name: name as DeletionRequestView["steps"][number]["name"],
    status: status as DeletionRequestView["steps"][number]["status"],
    updatedAt: string(record.updatedAt, "deletion.step.updatedAt"),
    errorCode: nullableString(record.errorCode, "deletion.step.errorCode"),
  };
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiContractError(`${path} must be an object`);
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ApiContractError(`${path} must be an array`);
  return value;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiContractError(`${path} must be a non-empty string`);
  return value;
}
function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return string(value, path);
}
function integer(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new ApiContractError(`${path} must be a non-negative integer`);
  return value;
}
function numberMap(value: unknown, path: string): Record<string, number> {
  const record = object(value, path);
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, integer(item, `${path}.${key}`)]));
}

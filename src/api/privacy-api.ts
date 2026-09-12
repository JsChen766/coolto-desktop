import { ApiContractError } from "./contract-values.js";
import {
  normalizeAck,
  normalizeConsent,
  normalizeDeletion,
  normalizeDeletionStart,
  normalizePolicy,
  normalizeSnapshot,
} from "./privacy-normalizers.js";
import type {
  CloudExportSnapshotV1,
  DeletionAckResponse,
  DeletionRequestView,
  DeletionStartResponse,
  ExportSnapshotRequest,
  PrivacyConsentDecision,
  PrivacyConsentView,
  PrivacyPolicyView,
  PrivacyRequester,
} from "../privacy/types.js";

export const CONTROL_HEADER = "X-Coolto-Deletion-Control";

export class PrivacyApi {
  public constructor(private readonly requester: PrivacyRequester) {}

  public async getPolicy(signal?: AbortSignal): Promise<PrivacyPolicyView> {
    return normalizePolicy(await this.requester.getJson<unknown>("/v1/privacy/policy", signal));
  }

  public async getConsent(signal?: AbortSignal): Promise<PrivacyConsentView> {
    return normalizeConsent(await this.requester.request<unknown>(
      "/v1/users/me/privacy/consent", signal ? { signal } : {},
    ));
  }

  public async recordConsent(input: PrivacyConsentDecision, idempotencyKey: string, signal?: AbortSignal): Promise<PrivacyConsentView> {
    return normalizeConsent(await this.requester.request<unknown>(
      "/v1/users/me/privacy/consent", jsonInit(input, idempotencyKey, signal),
    ));
  }

  public async exportSnapshot(input: ExportSnapshotRequest = { schemaVersion: 1, includeRevisionHistory: true }, signal?: AbortSignal): Promise<CloudExportSnapshotV1> {
    return normalizeSnapshot(await this.requester.request<unknown>(
      "/v1/users/me/privacy/export-snapshot", jsonInit(input, undefined, signal),
    ));
  }

  public async startDeletion(confirmation: string, idempotencyKey: string, signal?: AbortSignal): Promise<DeletionStartResponse> {
    return normalizeDeletionStart(await this.requester.request<unknown>(
      "/v1/users/me/deletion-requests", jsonInit({ confirmation }, idempotencyKey, signal),
    ));
  }

  public confirmDeletion(requestId: string, token: string, signal?: AbortSignal): Promise<DeletionRequestView> {
    return this.controlRequest(`/v1/users/me/deletion-requests/${encodeURIComponent(requestId)}/confirm`, token, signal, { method: "POST" });
  }

  public getDeletion(requestId: string, token: string, signal?: AbortSignal): Promise<DeletionRequestView> {
    return this.controlRequest(`/v1/users/me/deletion-requests/${encodeURIComponent(requestId)}`, token, signal, { method: "GET" });
  }

  public retryDeletion(requestId: string, token: string, signal?: AbortSignal): Promise<DeletionRequestView> {
    return this.controlRequest(`/v1/users/me/deletion-requests/${encodeURIComponent(requestId)}/retry`, token, signal, { method: "POST" });
  }

  public async ackDeletion(requestId: string, token: string | null, idempotencyKey: string, signal?: AbortSignal): Promise<DeletionAckResponse> {
    const path = `/v1/users/me/deletion-requests/${encodeURIComponent(requestId)}/ack`;
    const init = jsonInit({}, idempotencyKey, signal);
    const value = token
      ? await this.requester.requestControl<unknown>(path, token, init)
      : await this.requester.requestAckReplay<unknown>(path, idempotencyKey, init);
    return normalizeAck(value);
  }

  private async controlRequest(path: string, token: string, signal?: AbortSignal, init: RequestInit = {}): Promise<DeletionRequestView> {
    if (!token.trim()) throw new ApiContractError("deletion control token is required");
    return normalizeDeletion(await this.requester.requestControl<unknown>(path, token, {
      ...init, ...(signal ? { signal } : {}),
    }));
  }
}

function jsonInit(body: unknown, idempotencyKey: string | undefined, signal: AbortSignal | undefined): RequestInit {
  const headers = new Headers({ "content-type": "application/json" });
  if (idempotencyKey) headers.set("Idempotency-Key", idempotencyKey);
  return { method: "POST", headers, body: JSON.stringify(body), ...(signal ? { signal } : {}) };
}

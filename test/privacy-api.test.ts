import assert from "node:assert/strict";
import test from "node:test";

import { PrivacyApi } from "../src/api/privacy-api.js";
import type {
  CloudExportSnapshotV1,
  DeletionAckResponse,
  DeletionRequestView,
  PrivacyConsentView,
  PrivacyPolicyView,
  PrivacyRequester,
} from "../src/privacy/types.js";

const policy: PrivacyPolicyView = {
  policyVersion: "privacy-2026-09-08-v1",
  contentHash: "a".repeat(64),
  effectiveAt: "2026-09-08T00:00:00Z",
  changeClass: "major",
};
const consent: PrivacyConsentView = {
  policyVersion: policy.policyVersion,
  status: "required",
  acceptedAt: null,
  decisionAt: null,
};
const deletion: DeletionRequestView = {
  requestId: "request-1",
  status: "awaiting_control_ack",
  retryable: true,
  steps: [],
  thirdPartyDataUnaffected: true,
  updatedAt: "2026-09-08T00:00:00Z",
  completedAt: null,
};
const snapshot: CloudExportSnapshotV1 = {
  schemaVersion: 1,
  snapshotId: "snapshot-1",
  capturedAt: "2026-09-08T00:00:00Z",
  policyVersion: policy.policyVersion,
  accountScopeDigest: "b".repeat(64),
  entries: [], relationships: [], counts: {}, relationshipCount: 0,
  relationshipSha256: "c".repeat(64), rootSha256: "d".repeat(64),
};

interface Call {
  kind: "request" | "control" | "replay" | "get";
  path: string;
  token?: string;
  init?: RequestInit;
}

test("privacy API preserves consent, snapshot, and two-phase deletion contracts", async () => {
  const calls: Call[] = [];
  const requester: PrivacyRequester = {
    async getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
      calls.push({ kind: "get", path, ...(signal ? { init: { signal } } : {}) });
      return policy as T;
    },
    async request<T>(path: string, init?: RequestInit): Promise<T> {
      calls.push({ kind: "request", path, ...(init ? { init } : {}) });
      if (path.endsWith("/consent")) return consent as T;
      if (path.endsWith("export-snapshot")) return snapshot as T;
      return { ...deletion, deletionControlToken: "control-token" } as T;
    },
    async requestControl<T>(path: string, token: string, init?: RequestInit): Promise<T> {
      calls.push({ kind: "control", path, token, ...(init ? { init } : {}) });
      return path.endsWith("/ack")
        ? ({ requestId: "request-1", status: "acknowledged" } as T)
        : deletion as T;
    },
    async requestAckReplay<T>(path: string, idempotencyKey: string, init?: RequestInit): Promise<T> {
      calls.push({ kind: "replay", path, token: idempotencyKey, ...(init ? { init } : {}) });
      return { requestId: "request-1", status: "acknowledged" } as T;
    },
  };
  const api = new PrivacyApi(requester);

  assert.deepEqual(await api.getPolicy(), policy);
  assert.deepEqual(await api.getConsent(), consent);
  await api.recordConsent({ ...policy, decision: "accept", deviceId: "device-1", appVersion: "0.1.26" }, "consent-key");
  assert.deepEqual(await api.exportSnapshot(), snapshot);
  const started = await api.startDeletion("DELETE MY ACCOUNT", "delete-key");
  assert.equal(started.deletionControlToken, "control-token");
  assert.equal((await api.confirmDeletion("request-1", "control-token")).status, "awaiting_control_ack");
  assert.equal((await api.getDeletion("request-1", "control-token")).requestId, "request-1");
  assert.equal((await api.retryDeletion("request-1", "control-token")).requestId, "request-1");
  const ack = await api.ackDeletion("request-1", "control-token", "ack-key");
  assert.deepEqual(ack, { requestId: "request-1", status: "acknowledged" } satisfies DeletionAckResponse);
  const replay = await api.ackDeletion("request-1", null, "ack-key");
  assert.deepEqual(replay, { requestId: "request-1", status: "acknowledged" });

  const consentCall = calls.find((call) => call.path.endsWith("/consent") && call.kind === "request" && call.init?.method === "POST");
  assert.equal(new Headers(consentCall?.init?.headers).get("Idempotency-Key"), "consent-key");
  const startCall = calls.find((call) => call.path.endsWith("/deletion-requests") && call.kind === "request");
  assert.equal(new Headers(startCall?.init?.headers).get("Idempotency-Key"), "delete-key");
  const controlCalls = calls.filter((call) => call.kind === "control");
  assert.equal(controlCalls.length, 4);
  assert.equal(new Headers(controlCalls[0]?.init?.headers).get("Content-Type"), null);
  assert.equal(controlCalls[0]?.init?.method, "POST");
  assert.equal(controlCalls[2]?.init?.method, "POST");
  assert.equal(new Headers(controlCalls[3]?.init?.headers).get("Idempotency-Key"), "ack-key");
  const replayCall = calls.find((call) => call.kind === "replay");
  assert.equal(replayCall?.token, "ack-key");
  assert.equal(new Headers(replayCall?.init?.headers).get("Idempotency-Key"), "ack-key");
});

test("privacy API rejects a start response without a control token", async () => {
  const requester: PrivacyRequester = {
    getJson: async <T>(): Promise<T> => policy as T,
    request: async <T>(): Promise<T> => deletion as T,
    requestControl: async <T>(): Promise<T> => deletion as T,
    requestAckReplay: async <T>(): Promise<T> => deletion as T,
  };
  const api = new PrivacyApi(requester);
  await assert.rejects(api.startDeletion("DELETE MY ACCOUNT", "delete-key"), /deletionControlToken/u);
});

import type {
  SyncPage,
  SyncPushOperation,
  SyncPushResult,
} from "../sync/types.js";
import type { AuthenticatedRequester } from "./api-transport.js";
import {
  normalizeSyncPage,
  normalizeSyncPushResult,
} from "./sync-normalizers.js";

export class SyncApi {
  public constructor(private readonly requester: AuthenticatedRequester) {}

  public bootstrap(
    deviceId: string,
    cursor?: string,
    limit = 500,
    signal?: AbortSignal,
  ): Promise<SyncPage> {
    return this.requester.request<unknown>("/v1/sync/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        deviceId,
        cursor: cursor ?? null,
        limit,
      }),
      ...(signal ? { signal } : {}),
    }).then(normalizeSyncPage);
  }

  public pull(
    cursor: string,
    limit = 500,
    signal?: AbortSignal,
  ): Promise<SyncPage> {
    const query = new URLSearchParams({ cursor, limit: String(limit) });
    return this.requester.request<unknown>(`/v1/sync/pull?${query}`, {
      ...(signal ? { signal } : {}),
    }).then(normalizeSyncPage);
  }

  public push(
    deviceId: string,
    operations: SyncPushOperation[],
    batchId: string,
    signal?: AbortSignal,
  ): Promise<SyncPushResult> {
    return this.requester.request<unknown>("/v1/sync/push", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": batchId,
      },
      body: JSON.stringify({ deviceId, operations }),
      ...(signal ? { signal } : {}),
    }).then(normalizeSyncPushResult);
  }
}

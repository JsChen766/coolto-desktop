import { CooltoApiError } from "../../../api/coolto-api-error.js";
import type { SyncApi } from "../../../api/sync-api.js";
import type {
  SyncOperationResult,
  SyncPushOperation,
} from "../../../sync/types.js";
import { createUuidV7 } from "../../../sync/uuid-v7.js";
import { LocalSyncStore } from "./local-sync-store.js";
import type { PendingOperation } from "./local-sync-types.js";

const MAX_PAGES_PER_RUN = 10_000;

export class SyncWorker {
  #active: Promise<void> | undefined;
  readonly #stop = new AbortController();

  public constructor(
    private readonly api: SyncApi,
    private readonly store: LocalSyncStore,
    private readonly deviceId: string,
  ) {}

  public run(): Promise<void> {
    if (this.#active) return this.#active;
    this.#active = this.#cycle().finally(() => {
      this.#active = undefined;
    });
    return this.#active;
  }

  public async stop(): Promise<void> {
    this.#stop.abort();
    await this.#active?.catch(() => undefined);
  }

  async #cycle(): Promise<void> {
    await this.#push();
    try {
      await this.#receive();
    } catch (error: unknown) {
      if (!requiresBootstrap(error)) throw error;
      this.store.resetForBootstrap();
      await this.#bootstrap(undefined);
    }
  }

  async #push(): Promise<void> {
    const pending = this.store.listReadyOperations();
    if (pending.length === 0) return;
    let results: SyncOperationResult[];
    try {
      const response = await this.api.push(
        this.deviceId,
        pending.map(toPushOperation),
        createUuidV7(),
        this.#requestSignal(),
      );
      results = response.results;
    } catch (error: unknown) {
      if (error instanceof CooltoApiError && error.status === 401) throw error;
      results = pending.map((operation) => ({
        operationId: operation.operationId,
        entityId: operation.entityId,
        status: "retryable_error",
        appliedVersion: null,
        errorCode: apiErrorCode(error),
      }));
    }
    const byOperation = new Map(results.map((result) => [result.operationId, result]));
    for (const operation of pending) {
      const result = byOperation.get(operation.operationId) ?? missingResult(operation);
      this.store.applyOperationResult(
        result,
        retryTime(operation.attemptCount + 1),
      );
    }
  }

  async #receive(): Promise<void> {
    const state = this.store.getState();
    if (!state) {
      this.store.resetForBootstrap();
      await this.#bootstrap(undefined);
      return;
    }
    if (state.mode === "bootstrap") {
      await this.#bootstrap(state.cursor);
      return;
    }
    await this.#pull(state.cursor);
  }

  async #bootstrap(initialCursor: string | undefined): Promise<void> {
    let cursor = initialCursor;
    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_RUN; pageIndex += 1) {
      const page = await this.api.bootstrap(
        this.deviceId,
        cursor,
        500,
        this.#requestSignal(),
      );
      this.store.applyBootstrapPage(page);
      if (!page.hasMore) return;
      cursor = page.nextCursor;
    }
    throw new Error("同步 Bootstrap 页数超过安全上限");
  }

  async #pull(initialCursor: string): Promise<void> {
    let cursor = initialCursor;
    for (let pageIndex = 0; pageIndex < MAX_PAGES_PER_RUN; pageIndex += 1) {
      const page = await this.api.pull(
        cursor,
        500,
        this.#requestSignal(),
      );
      this.store.applyPullPage(page);
      if (!page.hasMore) return;
      cursor = page.nextCursor;
    }
    throw new Error("同步 Pull 页数超过安全上限");
  }

  #requestSignal(): AbortSignal {
    return AbortSignal.any([
      this.#stop.signal,
      AbortSignal.timeout(30_000),
    ]);
  }
}

function toPushOperation(operation: PendingOperation): SyncPushOperation {
  return {
    operationId: operation.operationId,
    entityType: operation.entityType,
    entityId: operation.entityId,
    action: operation.action,
    expectedVersion: operation.expectedVersion,
    payload: operation.payload,
  };
}

function missingResult(operation: PendingOperation): SyncOperationResult {
  return {
    operationId: operation.operationId,
    entityId: operation.entityId,
    status: "retryable_error",
    appliedVersion: null,
    errorCode: "sync_result_missing",
  };
}

function retryTime(attempt: number): string {
  // Cap the backoff at 5 minutes so a stalled outbox self-heals quickly
  // instead of waiting up to an hour between retries.
  const baseSeconds = Math.min(300, 2 ** Math.min(attempt, 10) * 2);
  const jittered = baseSeconds * (0.5 + Math.random());
  return new Date(Date.now() + jittered * 1_000).toISOString();
}

function requiresBootstrap(error: unknown): boolean {
  return (
    error instanceof CooltoApiError &&
    (error.code === "sync_cursor_expired" ||
      error.code === "sync_bootstrap_required")
  );
}

function apiErrorCode(error: unknown): string {
  return error instanceof CooltoApiError
    ? error.code ?? `http_${error.status}`
    : "sync_network_error";
}

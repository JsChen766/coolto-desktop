import { CooltoApiError } from "../../../api/coolto-api-error.js";
import type { SyncApi } from "../../../api/sync-api.js";
import { destroyLocalSyncState } from "./sync-destroy.js";

const SYNC_INTERVAL_MS = 30_000;

export interface SyncRuntimeStore {
  close(): void;
  removeLocalDirectory(): Promise<void>;
  recordFailure(errorCode: string): void;
}

export interface SyncRuntimeWorker {
  run(): Promise<void>;
  stop(): Promise<void>;
}

export interface SyncRuntimeDependencies {
  openStore(apiBaseUrl: string, userId: string): Promise<SyncRuntimeStore>;
  createWorker(api: SyncApi, store: SyncRuntimeStore, deviceId: string): SyncRuntimeWorker;
}

export class SyncRuntimeCore {
  #store: SyncRuntimeStore | undefined;
  #worker: SyncRuntimeWorker | undefined;
  #timer: NodeJS.Timeout | undefined;
  #initial: Promise<void> | undefined;
  readonly #listeners = new Set<() => void>();
  #pendingDirectoryRemoval: (() => Promise<void>) | undefined;
  readonly #openStore: SyncRuntimeDependencies["openStore"];
  readonly #createWorker: SyncRuntimeDependencies["createWorker"];

  public constructor(dependencies: SyncRuntimeDependencies) {
    this.#openStore = dependencies.openStore;
    this.#createWorker = dependencies.createWorker;
  }

  public async start(
    apiBaseUrl: string,
    userId: string,
    deviceId: string,
    api: SyncApi,
    networkEnabled = true,
  ): Promise<void> {
    await this.stop();
    if (this.#pendingDirectoryRemoval) {
      await this.#pendingDirectoryRemoval();
      this.#pendingDirectoryRemoval = undefined;
    }
    this.#store = await this.#openStore(apiBaseUrl, userId);
    this.#worker = networkEnabled
      ? this.#createWorker(api, this.#store, deviceId)
      : undefined;
    if (networkEnabled) {
      this.#timer = setInterval(() => this.trigger(), SYNC_INTERVAL_MS);
      this.#timer.unref();
      this.#initial = this.#run(false);
    } else {
      this.#initial = Promise.resolve();
    }
  }

  public trigger(): void {
    void this.#run(false);
  }

  public async runNow(): Promise<void> {
    await this.#run(true);
  }

  public subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  public requireStore(): SyncRuntimeStore {
    if (!this.#store) throw new Error("同步 Store 尚未启动");
    return this.#store;
  }

  public get isStarted(): boolean {
    return this.#store !== undefined;
  }

  public async waitForInitial(): Promise<void> {
    await this.#initial;
  }

  public async stop(): Promise<void> {
    clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#worker?.stop();
    this.#initial = undefined;
    this.#worker = undefined;
    this.#store?.close();
    this.#store = undefined;
  }

  public async destroyLocal(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#initial = undefined;
    const store = this.#store;
    const removeDirectory = store
      ? () => store.removeLocalDirectory()
      : this.#pendingDirectoryRemoval;
    this.#pendingDirectoryRemoval = removeDirectory;
    await destroyLocalSyncState({
      stopWorker: async () => { await this.#worker?.stop(); },
      closeStore: () => store?.close(),
      clearStoreReference: () => {
        this.#worker = undefined;
        this.#store = undefined;
      },
      removeDirectory: async () => {
        await removeDirectory?.();
        this.#pendingDirectoryRemoval = undefined;
      },
    });
  }

  #handleError(error: unknown): void {
    if (isAbort(error)) return;
    if (error instanceof CooltoApiError && error.status === 401) {
      this.#store?.recordFailure("sync_unauthorized");
      return;
    }
    try {
      this.#store?.recordFailure(runtimeErrorCode(error));
    } catch {
      // Failure telemetry must never create a second unhandled rejection.
    }
  }

  async #run(rethrow: boolean): Promise<void> {
    try {
      await this.#worker?.run();
    } catch (error: unknown) {
      this.#handleError(error);
      if (rethrow) throw error;
    } finally {
      for (const listener of this.#listeners) {
        try { listener(); } catch { /* UI notification cannot fail sync. */ }
      }
    }
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function runtimeErrorCode(error: unknown): string {
  if (error instanceof CooltoApiError) return error.code ?? `http_${error.status}`;
  if (error instanceof Error && error.name === "TimeoutError") return "sync_timeout";
  return "sync_runtime_error";
}

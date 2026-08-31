import { CooltoApiError } from "../../../api/coolto-api-error.js";
import type { SyncApi } from "../../../api/sync-api.js";
import { LocalSyncStore } from "./local-sync-store.js";
import { SyncWorker } from "./sync-worker.js";

const SYNC_INTERVAL_MS = 30_000;

export class SyncRuntime {
  #store: LocalSyncStore | undefined;
  #worker: SyncWorker | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
	#initial: Promise<void> | undefined;
  readonly #listeners = new Set<() => void>();

  public async start(
    apiBaseUrl: string,
    userId: string,
    deviceId: string,
    api: SyncApi,
  ): Promise<void> {
    await this.stop();
    this.#store = await LocalSyncStore.open(apiBaseUrl, userId);
    this.#worker = new SyncWorker(api, this.#store, deviceId);
    this.#timer = setInterval(() => this.trigger(), SYNC_INTERVAL_MS);
    this.#timer.unref();
	this.#initial = this.#run(false);
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

  public requireStore(): LocalSyncStore {
	if (!this.#store) throw new Error("同步 Store 尚未启动");
	return this.#store;
  }

  public async waitForInitial(): Promise<void> {
	await this.#initial;
  }

  public async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    await this.#worker?.stop();
	this.#initial = undefined;
    this.#worker = undefined;
    this.#store?.close();
    this.#store = undefined;
  }

  #handleError(error: unknown): void {
	if (isAbort(error)) return;
	// Keep the periodic timer alive even on 401: a transient session hiccup
	// must not leave the outbox permanently stalled (items would stay
	// "pending" until a manual sync). The next cycle retries and recovers.
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
  if (error instanceof CooltoApiError) {
    return error.code ?? `http_${error.status}`;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "sync_timeout";
  }
  return "sync_runtime_error";
}

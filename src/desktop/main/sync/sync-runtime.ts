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
	this.#initial = this.#worker.run().catch((error: unknown) => {
		this.#handleError(error);
	});
  }

  public trigger(): void {
	void this.#worker?.run().catch((error: unknown) => this.#handleError(error));
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
	if (error instanceof CooltoApiError && error.status === 401) {
		if (this.#timer) clearInterval(this.#timer);
		this.#timer = undefined;
	}
	try {
		this.#store?.recordFailure(runtimeErrorCode(error));
	} catch {
		// Failure telemetry must never create a second unhandled rejection.
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

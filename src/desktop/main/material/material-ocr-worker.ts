import type { UtilityProcess } from "electron";
import type { MaterialOcrRequest, MaterialOcrResult } from "../../../material/material-ocr-service.js";

interface ElectronUtilityModule {
  utilityProcess: {
    fork(modulePath: string, args: string[], options: { serviceName: string }): UtilityProcess;
  };
}
interface PendingOcr {
  resolve: (result: MaterialOcrResult) => void;
  reject: (error: unknown) => void;
  generation: number;
  timer: NodeJS.Timeout;
}

export class ElectronMaterialOcrWorker {
  readonly #pending = new Map<string, PendingOcr>();
  readonly #entryPath: string;
  #process: UtilityProcess | undefined;
  #restartCount = 0;
  #closed = false;

  public constructor(entryPath: string) {
    this.#entryPath = entryPath;
    this.#spawn();
  }

  public process(request: MaterialOcrRequest): Promise<MaterialOcrResult> {
    if (this.#closed) return Promise.reject(new Error("OCR worker 已关闭"));
    if (!this.#process) {
      this.#restartCount = 0;
      this.#spawn();
    }
    if (!this.#process) return Promise.reject(new Error("OCR worker 已关闭"));
    if (this.#pending.has(request.jobId)) return Promise.reject(new Error("OCR job 已经在处理中"));
    const { promise, resolve, reject } = Promise.withResolvers<MaterialOcrResult>();
    const timeoutMs = Math.max(1, Math.min(600_000, Date.parse(request.deadlineAt) - Date.now()));
    const timer = setTimeout(() => this.#timeout(request.jobId), timeoutMs);
    this.#pending.set(request.jobId, { resolve, reject, generation: request.generation, timer });
    this.#process.postMessage(request);
    return promise;
  }

  public async cancel(jobId: string): Promise<void> {
    if (this.#pending.has(jobId)) this.#process?.postMessage({ jobId, cancel: true });
  }

  public async close(): Promise<void> {
    this.#closed = true;
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("OCR worker 已关闭"));
    }
    this.#pending.clear();
    this.#process?.kill();
    this.#process = undefined;
  }

  #spawn(): void {
    const { utilityProcess } = requireElectron();
    const current = utilityProcess.fork(this.#entryPath, [], { serviceName: "coolto-material-ocr" });
    this.#process = current;
    current.on("message", (value: unknown) => this.#message(current, value));
    current.on("exit", (code) => this.#exit(current, code));
  }

  #message(current: UtilityProcess, value: unknown): void {
    if (current !== this.#process || !isWorkerMessage(value)) return;
    const pending = this.#pending.get(value.jobId);
    if (!pending || value.generation !== pending.generation) return;
    this.#pending.delete(value.jobId);
    clearTimeout(pending.timer);
    this.#restartCount = 0;
    if (value.error) pending.reject(new Error(value.error));
    else if (value.result) pending.resolve(value.result);
    else pending.reject(new Error("OCR worker returned an invalid response"));
  }

  #exit(current: UtilityProcess, code: number): void {
    if (current !== this.#process) return;
    this.#process = undefined;
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    for (const entry of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(`OCR worker exited (${code})`));
    }
    if (!this.#closed && this.#restartCount < 1) {
      this.#restartCount += 1;
      this.#spawn();
    }
  }

  #timeout(jobId: string): void {
    const pending = this.#pending.get(jobId);
    if (!pending) return;
    this.#pending.delete(jobId);
    pending.reject(new Error("OCR 超过 600 秒文档时限"));
    this.#process?.kill();
    if (!this.#closed && this.#restartCount < 1) {
      this.#restartCount += 1;
      this.#spawn();
    }
  }
}

function requireElectron(): ElectronUtilityModule {
  return require("electron") as ElectronUtilityModule;
}

function isWorkerMessage(value: unknown): value is {
  jobId: string;
  generation: number;
  result?: MaterialOcrResult;
  error?: string;
} {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return typeof message.jobId === "string" && Number.isSafeInteger(message.generation)
    && (message.result === undefined || typeof message.result === "object")
    && (message.error === undefined || typeof message.error === "string");
}

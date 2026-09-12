
import type { MaterialRepository, MaterialOcrSegmentRecord } from "./material-repository.js";
import type { MaterialOcrBinding } from "./material-repository.js";
import type { MaterialMediaKind } from "./material-types.js";
import type { OCRConfidenceV1, OCRTrustPolicyV1 } from "./material-ocr-confidence.js";
import {
  assertCurrentOcrJob,
  assertOcrBinding,
  markOcrFailed,
  MAX_OCR_INPUT_BYTES,
  MAX_OCR_SEGMENTS,
  ocrResultHash,
  validateOcrResult,
} from "./material-ocr-contract.js";

const DEFAULT_POLICY: OCRTrustPolicyV1 = {
  schema: "material.ocr-trust-policy",
  version: 1,
  minimumOverallConfidence: 0.8,
  minimumSegmentConfidence: 0.75,
};

export interface MaterialOcrRequest {
  jobId: string;
  materialId: string;
  contentHash: string;
  contentVersion: number;
  mediaKind: MaterialMediaKind;
  generation: number;
  bytes: Uint8Array;
  deadlineAt: string;
}

export interface MaterialOcrResult {
  text: string;
  overallConfidence: number;
  segments: MaterialOcrSegmentRecord[];
  engine: { name: string; version: string };
}

export interface MaterialOcrWorkerPort {
  process(request: MaterialOcrRequest): Promise<MaterialOcrResult>;
  cancel(jobId: string): Promise<void>;
  close(): Promise<void>;
}

export interface MaterialOcrServiceOptions {
  policy?: OCRTrustPolicyV1;
  now?: () => string;
  expiresInMs?: number;
}

export class MaterialOcrService {
  readonly #queue: Array<{ materialId: string; request: MaterialOcrRequest; resolve: (result: MaterialOcrResult) => void; reject: (error: unknown) => void }> = [];
  readonly #jobs = new Map<string, Promise<MaterialOcrResult>>();
  readonly #materialJobs = new Map<string, string>();
  readonly #generations = new Map<string, number>();
  #active = false;
  readonly #policy: OCRTrustPolicyV1;
  readonly #now: () => string;
  readonly #expiresInMs: number;
  #closed = false;

  public constructor(
    private readonly repository: MaterialRepository,
    private readonly worker: MaterialOcrWorkerPort,
    options: MaterialOcrServiceOptions = {},
  ) {
    this.#policy = options.policy ?? DEFAULT_POLICY;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#expiresInMs = options.expiresInMs ?? 30 * 24 * 60 * 60 * 1000;
  }

  public async process(materialId: string): Promise<MaterialOcrResult> {
    if (this.#closed) throw new Error("OCR 服务已关闭");
    const current = await this.repository.get(materialId);
    if (!current) throw new Error(`Material ${materialId} 不存在`);
    if (this.#closed) throw new Error("OCR 服务已关闭");
    const existingJob = this.#materialJobs.get(current.asset.identity.materialId);
    if (existingJob) {
      const previous = this.#jobs.get(existingJob);
      if (previous) return previous;
      this.#materialJobs.delete(current.asset.identity.materialId);
    }
    if (current.bytes.byteLength > MAX_OCR_INPUT_BYTES) throw new Error("OCR 输入超过 20 MiB");
    const normalizedId = current.asset.identity.materialId;
    const generation = (this.#generations.get(normalizedId) ?? 0) + 1;
    this.#generations.set(normalizedId, generation);
    const jobId = `ocr-${normalizedId}-${generation}-${Date.now()}`;
    const request: MaterialOcrRequest = {
      jobId, materialId: normalizedId, contentHash: current.asset.identity.contentHash,
      contentVersion: current.asset.identity.contentVersion,
      mediaKind: current.asset.metadata.mediaKind, bytes: Uint8Array.from(current.bytes),
      generation,
      deadlineAt: new Date(Date.now() + 600_000).toISOString(),
    };
    const promise = new Promise<MaterialOcrResult>((resolve, reject) => {
      if (this.#active && this.#queue.length >= 1) {
        reject(new Error("OCR 队列已满，请稍后重试"));
        return;
      }
      this.#queue.push({ materialId: normalizedId, request, resolve, reject });
      void this.#drain();
    });
    this.#jobs.set(jobId, promise);
    this.#materialJobs.set(normalizedId, jobId);
    try {
      return await promise;
    } finally {
      this.#jobs.delete(jobId);
      if (this.#materialJobs.get(normalizedId) === jobId) this.#materialJobs.delete(normalizedId);
    }
  }

  public async confirm(materialId: string, correctedText?: string): Promise<void> {
    const current = await this.repository.get(materialId);
    if (!current?.asset.processing.ocr || !current.ocrBinding) throw new Error("材料没有待确认的 OCR 结果");
    if (!current.asset.processing.ocr.needsUserConfirmation) throw new Error("当前 OCR 不需要重复确认");
    assertOcrBinding(current.asset.identity.ownerId, current.asset.identity.contentHash, current.asset.identity.contentVersion, current.ocrBinding);
    if (current.asset.processing.ocr.expiresAt && Date.parse(current.asset.processing.ocr.expiresAt) <= Date.parse(this.#now())) {
      throw new Error("OCR 已过期，请重新处理");
    }
    const now = this.#now();
    if (correctedText !== undefined && correctedText.trim().length > 180_000) {
      throw new Error("修正后的 OCR 文本超过 180000 字符上限");
    }
    const ocr: OCRConfidenceV1 = { ...current.asset.processing.ocr, needsUserConfirmation: false, confirmedAt: now };
    const ocrText = correctedText?.trim() || current.ocrText;
    if (ocrText === null || ocr.engine === null || ocr.overallConfidence === null) throw new Error("OCR 结果绑定不完整，请重新处理");
    const ocrBinding: MaterialOcrBinding = {
      ...current.ocrBinding, confirmedAt: now,
      resultHash: ocrResultHash({ text: ocrText, overallConfidence: ocr.overallConfidence, segments: [...current.ocrSegments], engine: ocr.engine }),
    };
    await this.repository.save({
      ...current,
      asset: { ...current.asset, processing: { status: "completed", ocr } },
      lifecycleStatus: "ready",
      ocrText,
      ocrBinding,
    });
  }

  public async cancel(materialId: string): Promise<void> {
    const jobId = this.#materialJobs.get(materialId);
    if (!jobId) return;
    const queuedIndex = this.#queue.findIndex((job) => job.request.jobId === jobId);
    if (queuedIndex >= 0) {
      const [job] = this.#queue.splice(queuedIndex, 1);
      if (job) job.reject(new Error("OCR 已取消"));
      return;
    }
    await this.worker.cancel(jobId);
  }

  public async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    const error = new Error("OCR 服务已关闭");
    for (const job of this.#queue.splice(0)) job.reject(error);
    await this.worker.close();
  }

  async #drain(): Promise<void> {
    if (this.#active || this.#closed) return;
    const job = this.#queue.shift();
    if (!job) return;
    this.#active = true;
    try {
      await this.repository.update(job.materialId, (record) => {
        assertCurrentOcrJob(record, job.request);
        return {
          ...record,
          lifecycleStatus: "processing",
          asset: { ...record.asset, processing: { status: "processing", ocr: null } },
          ocrBinding: undefined,
        };
      });
        const result = await this.worker.process(job.request);
        validateOcrResult(result);
        const latest = await this.repository.get(job.materialId);
        if (!latest) throw new Error("材料已删除，OCR 结果已丢弃");
        assertCurrentOcrJob(latest, job.request);
        const now = this.#now();
        const expiresAt = new Date(Date.parse(now) + this.#expiresInMs).toISOString();
        const segments = result.segments.slice(0, MAX_OCR_SEGMENTS);
        const needsConfirmation = result.overallConfidence < this.#policy.minimumOverallConfidence
          || segments.some((segment) => segment.confidence < this.#policy.minimumSegmentConfidence);
        const ocr: OCRConfidenceV1 = {
          schema: "material.ocr-confidence", version: 1, engine: result.engine,
          processingStatus: "completed", overallConfidence: result.overallConfidence,
          segments: segments.map((segment) => ({ segmentId: segment.segmentId, confidence: segment.confidence })),
          needsUserConfirmation: needsConfirmation, confirmedAt: null, expiresAt,
        };
        const binding: MaterialOcrBinding = {
          ownerId: latest.asset.identity.ownerId,
          materialHash: latest.asset.identity.contentHash,
          materialVersion: latest.asset.identity.contentVersion,
          jobId: job.request.jobId,
          resultHash: ocrResultHash(result),
          policy: {
            minimumOverallConfidence: this.#policy.minimumOverallConfidence,
            minimumSegmentConfidence: this.#policy.minimumSegmentConfidence,
          },
          confirmedAt: null,
        };
        await this.repository.update(job.materialId, (record) => ({
          ...record,
          lifecycleStatus: needsConfirmation ? "needs_confirmation" : "ready",
          asset: { ...record.asset, processing: { status: "completed", ocr } },
          ocrText: result.text,
          ocrSegments: segments,
          ocrBinding: binding,
          lastError: null,
        }));
      job.resolve(result);
    } catch (error: unknown) {
      await markOcrFailed(this.repository, job.materialId, job.request, error);
      job.reject(error);
    } finally {
      this.#active = false;
      void this.#drain();
    }
  }
}

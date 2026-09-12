import { hashMaterialText } from "./material-identity.js";
import type { MaterialOcrBinding, MaterialOcrSegmentRecord, MaterialRepository } from "./material-repository.js";
import type { MaterialOcrRequest, MaterialOcrResult } from "./material-ocr-service.js";

export const MAX_OCR_INPUT_BYTES = 20 * 1024 * 1024;
export const MAX_OCR_SEGMENTS = 20_000;

export function assertCurrentOcrJob(
  record: { asset: { identity: { materialId: string; contentHash: string; contentVersion: number } } },
  request: MaterialOcrRequest,
): void {
  if (record.asset.identity.materialId !== request.materialId
    || record.asset.identity.contentHash !== request.contentHash
    || record.asset.identity.contentVersion !== request.contentVersion) {
    throw new Error("OCR 结果已过期，请重新读取当前材料");
  }
}

export function assertOcrBinding(
  ownerId: string,
  materialHash: string,
  materialVersion: number,
  binding: MaterialOcrBinding,
): void {
  if (binding.ownerId !== ownerId || binding.materialHash !== materialHash || binding.materialVersion !== materialVersion) {
    throw new Error("OCR 确认绑定已失效，请重新处理材料");
  }
}

export function validateOcrResult(result: MaterialOcrResult): void {
  if (!result || typeof result.text !== "string" || result.text.length > 180_000
    || !Number.isFinite(result.overallConfidence) || result.overallConfidence < 0
    || result.overallConfidence > 1 || !Array.isArray(result.segments)
    || result.segments.length > MAX_OCR_SEGMENTS || !result.engine?.name || !result.engine.version) {
    throw new Error("OCR worker 返回结果无效");
  }
  const ids = new Set<string>();
  for (const segment of result.segments) {
    if (!validSegment(segment, ids)) throw new Error("OCR 片段结果无效");
  }
}

export function ocrResultHash(result: MaterialOcrResult): string {
  return hashMaterialText(JSON.stringify({
    text: result.text,
    overallConfidence: result.overallConfidence,
    segments: result.segments,
    engine: result.engine,
  }));
}

export async function markOcrFailed(
  repository: MaterialRepository,
  materialId: string,
  request: MaterialOcrRequest,
  error: unknown,
): Promise<void> {
  const current = await repository.get(materialId);
  if (!current) return;
  try {
    assertCurrentOcrJob(current, request);
    await repository.update(materialId, (record) => {
      assertCurrentOcrJob(record, request);
      return {
        ...record,
        lifecycleStatus: "failed",
        asset: { ...record.asset, processing: { status: "failed", ocr: null } },
        ocrBinding: undefined,
        lastError: error instanceof Error ? error.message : String(error),
      };
    });
  } catch {
    // A newer material generation owns the record; an old job may not overwrite it.
  }
}

function validSegment(segment: MaterialOcrSegmentRecord, ids: Set<string>): boolean {
  if (!segment.segmentId || ids.has(segment.segmentId) || typeof segment.text !== "string"
    || !Number.isFinite(segment.confidence) || segment.confidence < 0 || segment.confidence > 1) return false;
  ids.add(segment.segmentId);
  if (segment.page !== null && (!Number.isSafeInteger(segment.page) || segment.page < 1)) return false;
  return !segment.bbox || Object.values(segment.bbox).every((value) => Number.isFinite(value) && value >= 0);
}

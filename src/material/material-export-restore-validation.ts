import type { ParsedMaterialChunk } from "../files/parse-selected-file.js";
import { canonicalMaterialJson, hashMaterialBytes, normalizeMaterialHash, type MaterialCanonicalValue } from "./material-identity.js";
import { normalizeMaterialCitation } from "./material-citations.js";
import { normalizeMaterialAsset } from "./material-normalizer.js";
import { MAX_OCR_SEGMENTS, ocrResultHash } from "./material-ocr-contract.js";
import type { MaterialClassification, MaterialOcrBinding, MaterialOcrSegmentRecord, MaterialRelationRecord, MaterialStoredRecord } from "./material-repository.js";
import { hasUnsafeMaterialText, isIsoTimestamp, isMaterialDataProperty, isMaterialRecord, isSafeOpaqueId } from "./material-types.js";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_TEXT = 180_000;
const MAX_CHUNKS = 512;
const MAX_RELATIONS = 200;
const MAX_CITATIONS = 200;

export interface MaterialExportRecordV1 {
  asset: MaterialStoredRecord["asset"];
  lifecycleStatus: MaterialStoredRecord["lifecycleStatus"];
  classification: MaterialClassification;
  bytesBase64: string;
  parsedText: string | null;
  parsedChunks: ParsedMaterialChunk[];
  ocrText: string | null;
  ocrSegments: MaterialOcrSegmentRecord[];
  ocrBinding: MaterialOcrBinding | null;
  relations: MaterialRelationRecord[];
  lastError: string | null;
}

export interface MaterialExportPackageV1 {
  schema: "material.export";
  version: 1;
  ownerId: string;
  exportedAt: string;
  records: MaterialExportRecordV1[];
}

export function toMaterialExportRecord(record: MaterialStoredRecord): MaterialExportRecordV1 {
  return {
    asset: structuredClone(record.asset), lifecycleStatus: record.lifecycleStatus,
    classification: record.classification ?? "unclassified",
    bytesBase64: Buffer.from(record.bytes).toString("base64"),
    parsedText: record.parsedText, parsedChunks: record.parsedChunks.map((chunk) => ({ ...chunk })),
    ocrText: record.ocrText, ocrSegments: record.ocrSegments.map(cloneSegment),
    ocrBinding: record.ocrBinding ? structuredClone(record.ocrBinding) : null,
    relations: record.relations.map(cloneRelation), lastError: record.lastError,
  };
}

export function parseMaterialExportPackage(input: unknown, ownerId: string): MaterialStoredRecord[] {
  const value = expectRecord(input, "导出包");
  assertKeys(value, ["schema", "version", "ownerId", "exportedAt", "records"], "导出包");
  if (value.schema !== "material.export" || value.version !== 1) fail("版本不受支持");
  if (value.ownerId !== ownerId || !isSafeOpaqueId(value.ownerId)) fail("账号范围不一致");
  if (!isIsoTimestamp(value.exportedAt)) fail("导出时间无效");
  if (!denseArray(value.records, MAX_RELATIONS)) fail("记录列表无效");
  const ids = new Set<string>();
  return value.records.map((record, index) => {
    const parsed = parseRecord(record, ownerId, index);
    const id = parsed.asset.identity.materialId;
    if (ids.has(id)) fail("包含重复材料");
    ids.add(id);
    return parsed;
  });
}

function parseRecord(input: unknown, ownerId: string, index: number): MaterialStoredRecord {
  const value = expectRecord(input, `记录 ${index + 1}`);
  assertKeys(value, ["asset", "lifecycleStatus", "classification", "bytesBase64", "parsedText", "parsedChunks", "ocrText", "ocrSegments", "relations", "lastError"], `记录 ${index + 1}`, ["ocrBinding"]);
  const sourceKind = isMaterialRecord(value.asset) && isMaterialRecord(value.asset.metadata)
    ? value.asset.metadata.sourceKind : undefined;
  const authorization = sourceKind === "delivery_resume"
    ? { sourceKind: "delivery_resume" as const, materialIntent: true } : undefined;
  const asset = normalizeMaterialAsset(value.asset, authorization);
  if (asset.identity.ownerId !== ownerId) fail("包含其他账号数据");
  const bytes = decodeBytes(value.bytesBase64);
  if (hashMaterialBytes(bytes) !== asset.identity.contentHash) fail("原始字节指纹不匹配");
  const lifecycleStatus = parseLifecycle(value.lifecycleStatus);
  const classification = parseClassification(value.classification);
  const parsedText = parseText(value.parsedText, "解析文本");
  const parsedChunks = parseChunks(value.parsedChunks);
  const ocrText = parseText(value.ocrText, "OCR 文本", true);
  const ocrSegments = parseSegments(value.ocrSegments);
  const ocrBinding = parseOcrBinding(value.ocrBinding, asset, ocrText, ocrSegments);
  const relations = parseRelations(value.relations, asset);
  const lastError = parseError(value.lastError);
  assertState(asset, lifecycleStatus, classification, parsedText, ocrText, ocrSegments, ocrBinding, relations);
  return { asset, lifecycleStatus, classification, bytes, parsedText, parsedChunks, ocrText, ocrSegments, ocrBinding, relations, lastError };
}

function parseChunks(value: unknown): ParsedMaterialChunk[] {
  if (!denseArray(value, MAX_CHUNKS)) fail("解析片段无效");
  return value.map((input, index) => {
    const chunk = expectRecord(input, "解析片段");
    assertKeys(chunk, ["id", "index", "label", "text"], "解析片段");
    if (!isSafeOpaqueId(chunk.id) || chunk.index !== index || !safeLabel(chunk.label, 240) || !boundedText(chunk.text, 6_000)) fail("解析片段无效");
    return { id: chunk.id, index, label: chunk.label, text: chunk.text };
  });
}

function parseSegments(value: unknown): MaterialOcrSegmentRecord[] {
  if (!denseArray(value, MAX_OCR_SEGMENTS)) fail("OCR 片段无效");
  const ids = new Set<string>();
  return value.map((input) => {
    const segment = expectRecord(input, "OCR 片段");
    assertKeys(segment, ["segmentId", "text", "confidence", "page", "bbox"], "OCR 片段");
    if (!isSafeOpaqueId(segment.segmentId) || ids.has(segment.segmentId) || !boundedValue(segment.text, MAX_TEXT)
      || !confidence(segment.confidence) || !page(segment.page) || !bbox(segment.bbox)) fail("OCR 片段无效");
    ids.add(segment.segmentId);
    return { segmentId: segment.segmentId, text: segment.text, confidence: segment.confidence, page: segment.page, bbox: segment.bbox === null ? null : { ...segment.bbox } };
  });
}

function parseOcrBinding(value: unknown, asset: MaterialStoredRecord["asset"], ocrText: string | null, segments: MaterialOcrSegmentRecord[]): MaterialOcrBinding | undefined {
  if (value === undefined || value === null) return undefined;
  const binding = expectRecord(value, "OCR 绑定");
  assertKeys(binding, ["ownerId", "materialHash", "materialVersion", "jobId", "resultHash", "confirmedAt"], "OCR 绑定", ["policy"]);
  const ocr = asset.processing.ocr;
  if (typeof binding.ownerId !== "string" || typeof binding.materialHash !== "string" || typeof binding.materialVersion !== "number"
    || typeof binding.jobId !== "string" || typeof binding.resultHash !== "string" || !ocr || ocrText === null || ocr.engine === null || ocr.overallConfidence === null
    || binding.ownerId !== asset.identity.ownerId || binding.materialHash !== asset.identity.contentHash
    || binding.materialVersion !== asset.identity.contentVersion || !isSafeOpaqueId(binding.jobId) || !validHash(binding.resultHash)) fail("OCR 绑定无效");
  if (ocrResultHash({ text: ocrText, overallConfidence: ocr.overallConfidence, segments, engine: ocr.engine }) !== binding.resultHash) fail("OCR 结果指纹不一致");
  const confirmedAt = timestampOrNull(binding.confirmedAt, "OCR 确认时间");
  if (confirmedAt !== ocr.confirmedAt) fail("OCR 确认绑定不一致");
  const policy = binding.policy === undefined ? undefined : parsePolicy(binding.policy);
  return {
    ownerId: binding.ownerId, materialHash: binding.materialHash, materialVersion: binding.materialVersion,
    jobId: binding.jobId, resultHash: binding.resultHash,
    ...(policy ? { policy } : {}), confirmedAt,
  };
}

function parseRelations(value: unknown, asset: MaterialStoredRecord["asset"]): MaterialRelationRecord[] {
  if (!denseArray(value, MAX_RELATIONS)) fail("关系列表无效");
  const ids = new Set<string>();
  const citations = new Set<string>();
  return value.map((input) => {
    const relation = expectRecord(input, "关系");
    assertKeys(relation, ["relationId", "experienceId", "citations", "createdAt"], "关系");
    if (!isSafeOpaqueId(relation.relationId) || ids.has(relation.relationId) || !isSafeOpaqueId(relation.experienceId)
      || !isIsoTimestamp(relation.createdAt) || !denseArray(relation.citations, MAX_CITATIONS) || relation.citations.length === 0) fail("关系无效");
    const normalized = relation.citations.map((citation) => {
      let result: ReturnType<typeof normalizeMaterialCitation>;
      try { result = normalizeMaterialCitation(citation, asset); } catch { return fail("引用无效"); }
      const key = canonicalMaterialJson(result as unknown as MaterialCanonicalValue);
      if (citations.has(key)) fail("引用重复");
      citations.add(key);
      return result;
    });
    ids.add(relation.relationId);
    return { relationId: relation.relationId, experienceId: relation.experienceId, citations: normalized, createdAt: relation.createdAt };
  });
}

function assertState(asset: MaterialStoredRecord["asset"], lifecycle: MaterialStoredRecord["lifecycleStatus"], classification: MaterialClassification, parsedText: string | null, ocrText: string | null, segments: MaterialOcrSegmentRecord[], binding: MaterialOcrBinding | undefined, relations: MaterialRelationRecord[]): void {
  const ocr = asset.processing.ocr;
  if (classification === "unclassified" && relations.length > 0) fail("未归类材料不能含经历关系");
  if (classification === "classified" && relations.length === 0) fail("已归类材料缺少经历关系");
  if (lifecycle === "unclassified" || lifecycle === "expired") fail("生命周期状态无效");
  if (!ocr && (ocrText !== null || segments.length > 0 || binding)) fail("无 OCR 结果不能携带 OCR 数据");
  if (ocr && (ocrText === null || !binding || ocr.processingStatus !== "completed" || ocr.engine === null || ocr.overallConfidence === null || ocr.segments.length !== segments.length)) fail("OCR 结果绑定不完整");
  if (ocr && !ocr.segments.every((item, index) => item.segmentId === segments[index]?.segmentId && item.confidence === segments[index]?.confidence)) fail("OCR 片段绑定不一致");
  if (lifecycle === "queued" && (asset.processing.status !== "unprocessed" || ocr)) fail("队列状态无效");
  if (lifecycle === "processing" && (asset.processing.status !== "processing" || ocr)) fail("处理中状态无效");
  if (lifecycle === "failed" && (asset.processing.status !== "failed" || ocr)) fail("失败状态无效");
  if (lifecycle === "needs_confirmation" && (asset.processing.status !== "completed" || !ocr || !ocr.needsUserConfirmation || ocr.confirmedAt !== null)) fail("待确认 OCR 状态无效");
  if (lifecycle === "ready" && (asset.processing.status !== "completed" || ocr?.needsUserConfirmation)) fail("就绪状态无效");
  if (parsedText !== null && parsedText.length === 0) fail("解析文本无效");
}

function parsePolicy(value: unknown): { minimumOverallConfidence: number; minimumSegmentConfidence: number } {
  const policy = expectRecord(value, "OCR 策略");
  assertKeys(policy, ["minimumOverallConfidence", "minimumSegmentConfidence"], "OCR 策略");
  if (!confidence(policy.minimumOverallConfidence) || !confidence(policy.minimumSegmentConfidence)) fail("OCR 策略无效");
  return { minimumOverallConfidence: policy.minimumOverallConfidence, minimumSegmentConfidence: policy.minimumSegmentConfidence };
}
function parseLifecycle(value: unknown): MaterialStoredRecord["lifecycleStatus"] {
  if (value === "unclassified" || value === "queued" || value === "processing" || value === "needs_confirmation" || value === "ready" || value === "failed" || value === "expired") return value;
  return fail("生命周期状态无效");
}
function parseClassification(value: unknown): MaterialClassification { if (value === "unclassified" || value === "classified") return value; return fail("分类状态无效"); }
function parseText(value: unknown, label: string, allowEmpty = false): string | null {
  if (value === null) return null;
  if (allowEmpty) { if (!boundedValue(value, MAX_TEXT)) fail(`${label}无效`); }
  else if (!boundedText(value, MAX_TEXT)) fail(`${label}无效`);
  return value;
}
function parseError(value: unknown): string | null { if (value === null) return null; if (!safeLabel(value, 1_000)) fail("错误状态无效"); return value; }
function timestampOrNull(value: unknown, label: string): string | null { if (value === null) return null; if (!isIsoTimestamp(value)) fail(`${label}无效`); return value; }
function decodeBytes(value: unknown): Buffer {
  if (typeof value !== "string" || value.length > Math.ceil(MAX_BYTES / 3) * 4 || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) fail("原始字节编码无效");
  const bytes = Buffer.from(value, "base64");
  if (bytes.byteLength > MAX_BYTES || bytes.toString("base64") !== value) fail("原始字节编码无效");
  return bytes;
}
function expectRecord(value: unknown, label: string): Record<string, unknown> { if (!isMaterialRecord(value)) fail(`${label}无效`); return value; }
function denseArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || !Number.isSafeInteger(value.length) || value.length > maximum) return false;
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    if (typeof key !== "string" || !/^(?:0|[1-9]\d*)$/u.test(key) || Number(key) >= value.length || !isMaterialDataProperty(value, key)) return false;
  }
  for (let index = 0; index < value.length; index += 1) if (!Object.hasOwn(value, index) || !isMaterialDataProperty(value, index)) return false;
  return true;
}
function assertKeys(value: Record<string, unknown>, required: readonly string[], label: string, optional: readonly string[] = []): void {
  for (const key of required) if (!Object.hasOwn(value, key) || !isMaterialDataProperty(value, key)) fail(`${label}字段无效`);
  for (const key of Reflect.ownKeys(value)) if (typeof key !== "string" || (!required.includes(key) && !optional.includes(key)) || !isMaterialDataProperty(value, key)) fail(`${label}包含未知字段`);
}
function cloneSegment(segment: MaterialOcrSegmentRecord): MaterialOcrSegmentRecord { return { ...segment, bbox: segment.bbox ? { ...segment.bbox } : null }; }
function cloneRelation(relation: MaterialRelationRecord): MaterialRelationRecord { return { ...relation, citations: structuredClone(relation.citations) }; }
function confidence(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1; }
function page(value: unknown): value is number | null { return value === null || (typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= 50); }
function bbox(value: unknown): value is { x: number; y: number; width: number; height: number } | null {
  if (value === null || !isMaterialRecord(value)) return value === null;
  const keys = ["x", "y", "width", "height"];
  try { assertKeys(value, keys, "OCR 坐标"); } catch { return false; }
  return keys.every((key) => typeof value[key] === "number" && Number.isFinite(value[key]) && (value[key] as number) >= 0);
}
function validHash(value: unknown): boolean { try { return typeof value === "string" && normalizeMaterialHash(value) === value; } catch { return false; } }
function boundedText(value: unknown, max: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("\0"); }
function boundedValue(value: unknown, max: number): value is string { return typeof value === "string" && value.length <= max && !value.includes("\0"); }
function safeLabel(value: unknown, max: number): value is string { return boundedText(value, max) && !hasUnsafeMaterialText(value); }
function fail(message: string): never { throw new Error(`材料导出包${message}`); }

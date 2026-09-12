import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { MaterialOcrRequest, MaterialOcrResult } from "../../../material/material-ocr-service.js";
import type { MaterialOcrSegmentRecord } from "../../../material/material-repository.js";
import type { MaterialMediaKind } from "../../../material/material-types.js";

const nodeRequire = createRequire(__filename);
const MAX_PAGES = 50;
const MAX_PAGE_PIXELS = 25_000_000;
const MAX_DOCUMENT_PIXELS = 250_000_000;
const MAX_TEXT_CHARS = 180_000;
const MAX_SEGMENTS_PER_PAGE = 4_000;
const MAX_SEGMENTS = 20_000;
const MAX_PAGE_TIME_MS = 120_000;
const MAX_WORKER_RSS = 512 * 1024 * 1024;
const MEDIA_KINDS: Record<MaterialMediaKind, true> = {
  pdf: true, docx: true, text: true, markdown: true, png: true, jpg: true, jpeg: true, scanned_pdf: true,
};
const cancelled = new Set<string>();

interface UtilityParentPort {
  postMessage(message: unknown): void;
  on(event: "message", listener: (value: unknown) => void): void;
}

interface OCRWorker {
  recognize(image: Buffer, options?: unknown, output?: unknown): Promise<{ data: Record<string, unknown> }>;
  terminate(): Promise<void>;
}

interface TesseractModule {
  createWorker(langs: string, oem: number, options: Record<string, unknown>): Promise<OCRWorker>;
}

export function startMaterialOcrUtilityProcess(): void {
  const parentPort = (process as unknown as { parentPort?: UtilityParentPort }).parentPort;
  if (!parentPort) return;
  parentPort.postMessage({ jobId: "__boot", error: "ready" });
  parentPort.on("message", (event) => {
    const value = unwrapMessage(event);
    if (isCancelMessage(value)) { cancelled.add(value.jobId); return; }
    if (!isOcrRequest(value)) {
      parentPort.postMessage({ jobId: "__invalid", error: "OCR worker request rejected" });
      return;
    }
    void run(value)
      .then((result) => parentPort.postMessage({ jobId: value.jobId, generation: value.generation, result }))
      .catch((error: unknown) => parentPort.postMessage({
        jobId: value.jobId, generation: value.generation,
        error: error instanceof Error ? error.message : String(error),
      }));
  });
}

async function run(request: MaterialOcrRequest): Promise<MaterialOcrResult> {
  const deadline = Date.parse(request.deadlineAt);
  if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error("OCR 文档已超过 600 秒时限");
  assertWorkerMemory();
  const tesseract = nodeRequire("tesseract.js") as TesseractModule;
  const workerPath = nodeRequire.resolve("tesseract.js/src/worker-script/node/index.js");
  const resources = await import("./material-ocr-resources.js").then((module) => module.inspectMaterialOcrResources(workerPath));
  const worker = await tesseract.createWorker("eng+chi_sim", 1, {
    langPath: resources.directory, cacheMethod: "none", gzip: false, workerPath: resources.workerPath,
  });
  try {
    const pages = request.mediaKind === "scanned_pdf"
      ? await renderPdfPages(request.bytes) : [Buffer.from(request.bytes)];
    if (Date.now() >= deadline) throw new Error("OCR 文档已超过 600 秒时限");
    const pixels = await pagePixels(pages);
    if (pages.length > MAX_PAGES || pixels.some((value) => value > MAX_PAGE_PIXELS)
      || pixels.reduce((sum, value) => sum + value, 0) > MAX_DOCUMENT_PIXELS) {
      throw new Error("OCR 页数或像素超过上限");
    }
    const texts: string[] = [];
    const segments: MaterialOcrSegmentRecord[] = [];
    let totalChars = 0;
    for (let index = 0; index < pages.length; index += 1) {
      if (cancelled.has(request.jobId)) throw new Error("OCR 已取消");
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("OCR 文档已超过 600 秒时限");
      const result = await recognizePage(worker, pages[index]!, Math.min(MAX_PAGE_TIME_MS, remaining));
      assertWorkerMemory();
      const text = typeof result.data.text === "string" ? result.data.text.trim() : "";
      if (text) texts.push(text);
      totalChars += text.length;
      if (totalChars > MAX_TEXT_CHARS) throw new Error("OCR 文本超过 180000 字符上限");
      const pageStart = segments.length;
      appendTsvSegments(segments, result.data.tsv, index + 1, pageStart);
      if (segments.length - pageStart > MAX_SEGMENTS_PER_PAGE || segments.length > MAX_SEGMENTS) {
        throw new Error("OCR 片段超过上限");
      }
    }
    const overallConfidence = segments.length
      ? segments.reduce((sum, segment) => sum + segment.confidence, 0) / segments.length : 0;
    return { text: texts.join("\n\n"), overallConfidence, segments,
      engine: { name: "tesseract-js-wasm", version: "7.0.0" } };
  } finally {
    await worker.terminate();
    cancelled.delete(request.jobId);
  }
}

async function recognizePage(
  worker: OCRWorker,
  image: Buffer,
  timeoutMs: number,
): Promise<{ data: Record<string, unknown> }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      worker.recognize(image, {}, { text: true, tsv: true }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("OCR 单页超过 120 秒时限")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function pagePixels(pages: readonly Buffer[]): number[] {
  return pages.map(imagePixelsFromHeader);
}

function imagePixelsFromHeader(bytes: Buffer): number {
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return bytes.readUInt32BE(16) * bytes.readUInt32BE(20);
  }
  if (bytes[0] === 0xFF && bytes[1] === 0xD8) return jpegPixelsFromHeader(bytes);
  throw new Error("OCR 图片尺寸无法安全解析");
}

function jpegPixelsFromHeader(bytes: Buffer): number {
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xFF) { offset += 1; continue; }
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xC0 && marker <= 0xC3) return bytes.readUInt16BE(offset + 5) * bytes.readUInt16BE(offset + 7);
    if (length < 2) break;
    offset += 2 + length;
  }
  throw new Error("OCR JPEG 尺寸无法安全解析");
}

function appendTsvSegments(target: MaterialOcrSegmentRecord[], value: unknown, fallbackPage: number, pageStart: number): void {
  if (typeof value !== "string") return;
  for (const line of value.split(/\r?\n/u).slice(1)) {
    const columns = line.split("\t");
    if (columns.length < 12) continue;
    const page = Number(columns[1]) || fallbackPage;
    const left = Number(columns[6]); const top = Number(columns[7]);
    const width = Number(columns[8]); const height = Number(columns[9]);
    const confidence = Number(columns[10]) / 100;
    const text = columns.slice(11).join("\t").trim();
    if (!text || !Number.isFinite(confidence) || !Number.isFinite(left)
      || !Number.isFinite(top) || !Number.isFinite(width) || !Number.isFinite(height)) continue;
    if (target.length - pageStart >= MAX_SEGMENTS_PER_PAGE || target.length >= MAX_SEGMENTS) throw new Error("OCR 片段超过上限");
    target.push({ segmentId: `ocr-${page}-${target.length + 1}`, text,
      confidence: Math.max(0, Math.min(1, confidence)), page,
      bbox: { x: left, y: top, width: Math.max(0, width), height: Math.max(0, height) } });
  }
}

async function renderPdfPages(bytes: Uint8Array): Promise<Buffer[]> {
  const canvasModule = nodeRequire("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
  const globals = globalThis as Record<string, unknown>;
  if (typeof globals.DOMMatrix !== "function") globals.DOMMatrix = canvasModule.DOMMatrix;
  if (typeof globals.DOMPoint !== "function") globals.DOMPoint = canvasModule.DOMPoint;
  const { getDocument } = nodeRequire("pdfjs-dist/legacy/build/pdf.mjs") as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = canvasModule;
  const loadingTask = getDocument({ data: bytes });
  const document = await loadingTask.promise;
  const pages: Buffer[] = [];
  let totalPixels = 0;
  try {
    if (document.numPages > MAX_PAGES) throw new Error("OCR 页数超过 50 页上限");
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const viewport = page.getViewport({ scale: 2 });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      const pixels = width * height;
      if (pixels > MAX_PAGE_PIXELS || (totalPixels += pixels) > MAX_DOCUMENT_PIXELS) throw new Error("OCR 像素超过上限");
      const canvas = createCanvas(width, height);
      await page.render({ canvasContext: canvas.getContext("2d") as never, viewport }).promise;
      pages.push(canvas.toBuffer("image/png"));
    }
  } finally { await loadingTask.destroy(); }
  return pages;
}

function unwrapMessage(value: unknown): unknown {
  return value && typeof value === "object" && "data" in value ? (value as { data: unknown }).data : value;
}

function isCancelMessage(value: unknown): value is { jobId: string; cancel: true } {
  return isPlainObject(value) && Object.keys(value).length === 2
    && typeof value.jobId === "string" && value.cancel === true;
}

function isOcrRequest(value: unknown): value is MaterialOcrRequest {
  if (!isPlainObject(value)) return false;
  const keys = ["jobId", "materialId", "contentHash", "contentVersion", "mediaKind", "generation", "bytes", "deadlineAt"];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some((key) => !keys.includes(key))) return false;
  if (keys.some((key) => !Object.hasOwn(value, key))) return false;
  const deadline = Date.parse(value.deadlineAt as string);
  return typeof value.jobId === "string" && value.jobId.length > 0 && typeof value.materialId === "string"
    && value.materialId.length > 0
    && /^[0-9a-f]{64}$/u.test(value.contentHash as string)
    && Number.isSafeInteger(value.contentVersion) && (value.contentVersion as number) > 0
    && typeof value.mediaKind === "string" && Object.hasOwn(MEDIA_KINDS, value.mediaKind)
    && Number.isSafeInteger(value.generation) && (value.generation as number) > 0
    && value.bytes instanceof Uint8Array && value.bytes.byteLength > 0 && value.bytes.byteLength <= 20 * 1024 * 1024
    && typeof value.deadlineAt === "string" && Number.isFinite(deadline)
    && deadline > Date.now() && deadline <= Date.now() + 600_000;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertWorkerMemory(): void {
  if (process.memoryUsage().rss > MAX_WORKER_RSS) throw new Error("OCR worker 内存超过 512 MiB 上限");
}

export function defaultOcrResourceDirectory(): string {
  const local = join(process.cwd(), "build", "material-ocr");
  return existsSync(local) ? local : join(process.resourcesPath, "material-ocr");
}

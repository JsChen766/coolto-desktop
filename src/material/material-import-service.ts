import type { MaterialSelectedFileContent } from "../files/types.js";

import {
  parseSelectedMaterialDocument,
  type ParsedMaterialDocument,
} from "../files/parse-selected-file.js";
import type { MaterialFileBoundary } from "./material-file-boundary.js";
import {
  deriveMaterialId,
  hashMaterialBytes,
} from "./material-identity.js";
import {
  MemoryMaterialRepository,
  type MaterialRepository,
  type MaterialStoredRecord,
} from "./material-repository.js";
import type { MaterialAssetV1, MaterialMediaKind, MaterialSourceKind } from "./material-types.js";

export interface MaterialImportInput {
  fileId: string;
  ownerId: string;
  sourceKind?: MaterialSourceKind;
  sourceLabel?: string | null;
  title?: string;
  capturedAt?: string;
}

export interface MaterialImportResult {
  duplicate: boolean;
  record: MaterialStoredRecord;
}

export interface MaterialParser {
  parse(content: MaterialSelectedFileContent): Promise<ParsedMaterialDocument>;
}

export class MaterialImportService {
  readonly #parser: MaterialParser;

  public constructor(
    private readonly files: MaterialFileBoundary,
    private readonly repository: MaterialRepository = new MemoryMaterialRepository(),
    parser?: MaterialParser,
  ) {
    this.#parser = parser ?? {
      parse: (content) => parseSelectedMaterialDocument(content, { allowOcr: true }),
    };
  }

  public async import(input: MaterialImportInput): Promise<MaterialImportResult> {
    const ownerId = input.ownerId.trim();
    if (!ownerId) throw new Error("材料账号不能为空");
    const selected = await this.files.read(input.fileId);
    const bytes = Uint8Array.from(selected.content);
    const contentHash = hashMaterialBytes(bytes);
    const existing = await this.repository.list();
    const duplicate = existing.find((entry) => entry.asset.identity.ownerId === ownerId
      && entry.asset.identity.contentHash === contentHash);
    if (duplicate) {
      const record = await this.repository.get(duplicate.asset.identity.materialId);
      if (record) return { duplicate: true, record };
    }
    const parsed = await this.#parser.parse({ metadata: selected.metadata, content: Buffer.from(bytes) });
    const sourceKind = input.sourceKind ?? "user_upload";
    const capturedAt = input.capturedAt ?? new Date().toISOString();
    const mediaKind = mediaKindFor(selected.metadata.type, parsed.requiresOcr);
    const asset = createAsset({
      ownerId,
      contentHash,
      mediaKind,
      sourceKind,
      sourceLabel: input.sourceLabel ?? null,
      originalFilename: selected.metadata.filename,
      title: input.title ?? titleFromFilename(selected.metadata.filename),
      capturedAt,
      needsOcr: parsed.requiresOcr,
    });
    const record: MaterialStoredRecord = {
      asset,
      lifecycleStatus: parsed.requiresOcr ? "queued" : "ready",
      classification: "unclassified",
      bytes,
      parsedText: parsed.text || null,
      parsedChunks: parsed.chunks,
      ocrText: null,
      ocrSegments: [],
      relations: [],
      lastError: null,
    };
    return { duplicate: false, record: await this.repository.save(record) };
  }
}

function createAsset(input: {
  ownerId: string;
  contentHash: string;
  mediaKind: MaterialMediaKind;
  sourceKind: MaterialSourceKind;
  sourceLabel: string | null;
  originalFilename: string;
  title: string;
  capturedAt: string;
  needsOcr: boolean;
}): MaterialAssetV1 {
  return {
    schema: "material.asset",
    version: 1,
    identity: {
      materialId: deriveMaterialId(input.ownerId, input.contentHash),
      ownerId: input.ownerId,
      contentHash: input.contentHash,
      contentVersion: 1,
    },
    metadata: {
      title: input.title,
      mediaKind: input.mediaKind,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      originalFilename: input.originalFilename,
      capturedAt: input.capturedAt,
    },
    processing: {
      status: input.needsOcr ? "unprocessed" : "completed",
      ocr: null,
    },
  };
}

function mediaKindFor(type: string, needsOcr: boolean): MaterialMediaKind {
  if (needsOcr && type === "pdf") return "scanned_pdf";
  if (type === "jpg" || type === "jpeg" || type === "png") return type;
  if (type === "pdf" || type === "docx" || type === "text" || type === "markdown") return type;
  throw new Error(`不支持的材料类型：${type}`);
}
function titleFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/u, "").trim() || "本地材料";
}

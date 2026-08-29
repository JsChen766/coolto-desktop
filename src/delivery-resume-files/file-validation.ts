import { createHash, randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, extname, parse } from "node:path";

import type {
  DeliveryResumeFile,
  DeliveryResumeFileType,
} from "./types.js";

const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const FILE_TYPES = new Map<string, {
  type: DeliveryResumeFileType;
  mimeType: string;
}>([
  [".pdf", { type: "pdf", mimeType: "application/pdf" }],
  [".docx", {
    type: "docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }],
]);

export interface ValidatedDeliveryResumeFile {
  metadata: DeliveryResumeFile;
  content: Uint8Array;
}

export async function validateDeliveryResumeFile(
  inputPath: string,
  now = new Date().toISOString(),
): Promise<ValidatedDeliveryResumeFile> {
  const path = await realpath(inputPath);
  const fileStat = await stat(path);
  const filename = basename(path);
  if (!fileStat.isFile()) throw new Error(`投递文件不是普通文件：${filename}`);
  if (fileStat.size <= 0) throw new Error(`投递文件为空：${filename}`);
  if (fileStat.size > MAX_SIZE_BYTES) {
    throw new Error(`投递文件超过 20MB：${filename}`);
  }
  const format = FILE_TYPES.get(extname(path).toLocaleLowerCase());
  if (!format) throw new Error("用户原始简历仅支持 PDF 或 DOCX");
  const content = await readFile(path);
  assertSignature(format.type, content, filename);
  return {
    metadata: {
      id: randomUUID(),
      title: parse(filename).name.trim() || "用户原始简历",
      originalFilename: filename,
      type: format.type,
      mimeType: format.mimeType,
      sizeBytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
      preferred: false,
      createdAt: now,
      updatedAt: now,
    },
    content,
  };
}

function assertSignature(
  type: DeliveryResumeFileType,
  content: Uint8Array,
  filename: string,
): void {
  const valid = type === "pdf"
    ? Buffer.from(content.subarray(0, 1024)).includes(Buffer.from("%PDF-"))
    : content[0] === 0x50 && content[1] === 0x4b;
  if (!valid) throw new Error(`投递文件格式与扩展名不一致：${filename}`);
}

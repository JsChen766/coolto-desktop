import mammoth from "mammoth";
import { createRequire } from "node:module";

import { extractLayoutText } from "./pdf-layout.js";
import { ensurePdfEnvironment } from "./pdfjs-environment.js";
import type { SelectedFileContent } from "./types.js";

// 主进程代码在发布构建里由原生保护模块经 vm 执行（protect-main-bundle），
// vm 上下文不支持 dynamic import()（报 "A dynamic import callback was not
// specified"）；require 由加载器真实传入，因此按需加载必须走 createRequire。
const nodeRequire = createRequire(import.meta.url);

export const MAX_MATERIAL_CHARS = 180_000;
const MAX_CHUNK_CHARS = 6_000;

export interface ParsedSelectedFile {
  fileId: string;
  filename: string;
  text: string;
  charCount: number;
  truncated: boolean;
}

export interface ParsedMaterialChunk {
  id: string;
  index: number;
  label: string;
  text: string;
}

export interface ParsedMaterialDocument extends ParsedSelectedFile {
  chunks: ParsedMaterialChunk[];
}

export async function parseSelectedFile(
  selectedFile: SelectedFileContent,
): Promise<ParsedSelectedFile> {
  const document = await parseSelectedMaterialDocument(selectedFile);
  const { chunks: _chunks, ...parsed } = document;
  return parsed;
}

export async function parseSelectedMaterialDocument(
  selectedFile: SelectedFileContent,
): Promise<ParsedMaterialDocument> {
  let parts: Array<{ label: string; text: string }>;
  switch (selectedFile.metadata.type) {
    case "pdf":
      parts = (await parsePdfPages(selectedFile.content)).map((text, index) => ({
        label: `第 ${index + 1} 页`, text,
      }));
      break;
    case "docx":
      parts = [{ label: "文档正文", text: await parseDocx(selectedFile.content) }];
      break;
    case "text":
    case "markdown":
      parts = [{ label: "文档正文", text: decodeText(selectedFile.content) }];
      break;
  }

  const normalizedParts = parts
    .map((part) => ({ ...part, text: part.text.trim() }))
    .filter((part) => part.text);
  const normalized = normalizedParts.map((part) => part.text).join("\n\n");
  if (!normalized) {
    throw new Error(
      `未能从 ${selectedFile.metadata.filename} 提取文本；扫描版 PDF 暂不支持 OCR`,
    );
  }
  if (normalized.length > MAX_MATERIAL_CHARS) {
    throw new Error(`材料文本超过 ${MAX_MATERIAL_CHARS.toLocaleString()} 字符，请拆分后上传`);
  }
  const chunks = normalizedParts.flatMap((part) => splitPart(part.label, part.text));
  return {
    fileId: selectedFile.metadata.id,
    filename: selectedFile.metadata.filename,
    text: normalized,
    charCount: normalized.length,
    truncated: false,
    chunks: chunks.map((chunk, index) => ({
      id: `chunk-${index + 1}`,
      index,
      ...chunk,
    })),
  };
}

export function chunkMaterialText(label: string, text: string): ParsedMaterialChunk[] {
  const normalized = text.trim();
  if (!normalized) return [];
  return splitPart(label, normalized).map((chunk, index) => ({
    id: `chunk-${index + 1}`, index, ...chunk,
  }));
}

async function parsePdfPages(content: Buffer): Promise<string[]> {
  await ensurePdfEnvironment();
  const { getDocument } = nodeRequire(
    "pdfjs-dist/legacy/build/pdf.mjs",
  ) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: new Uint8Array(content),
  });
  const document = await loadingTask.promise;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pages.push(extractLayoutText(textContent));
    }
  } finally {
    await loadingTask.destroy();
  }

  return pages;
}

async function parseDocx(content: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: content });
  return result.value;
}

function decodeText(content: Buffer): string {
  for (const encoding of ["utf-8", "gb18030", "windows-1252"] as const) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(content);
    } catch {
      continue;
    }
  }
  throw new Error("无法识别文本文件编码");
}

function splitPart(label: string, text: string): Array<{ label: string; text: string }> {
  if (text.length <= MAX_CHUNK_CHARS) return [{ label, text }];
  const paragraphs = text.split(/\n{2,}/u).map((value) => value.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    if (paragraph.length > MAX_CHUNK_CHARS) {
      if (current) { chunks.push(current); current = ""; }
      for (let start = 0; start < paragraph.length; start += MAX_CHUNK_CHARS) {
        chunks.push(paragraph.slice(start, start + MAX_CHUNK_CHARS));
      }
    } else if (!current || current.length + paragraph.length + 2 <= MAX_CHUNK_CHARS) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    } else {
      chunks.push(current);
      current = paragraph;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, index) => ({
    label: chunks.length === 1 ? label : `${label}（${index + 1}/${chunks.length}）`,
    text: chunk,
  }));
}

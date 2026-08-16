import mammoth from "mammoth";
import { createRequire } from "node:module";

import { extractLayoutText } from "./pdf-layout.js";
import { ensurePdfEnvironment } from "./pdfjs-environment.js";
import type { SelectedFileContent } from "./types.js";

// 主进程代码在发布构建里由原生保护模块经 vm 执行（protect-main-bundle），
// vm 上下文不支持 dynamic import()（报 "A dynamic import callback was not
// specified"）；require 由加载器真实传入，因此按需加载必须走 createRequire。
const nodeRequire = createRequire(import.meta.url);

const MAX_PARSED_CHARS = 80_000;

export interface ParsedSelectedFile {
  fileId: string;
  filename: string;
  text: string;
  charCount: number;
  truncated: boolean;
}

export async function parseSelectedFile(
  selectedFile: SelectedFileContent,
): Promise<ParsedSelectedFile> {
  let text: string;
  switch (selectedFile.metadata.type) {
    case "pdf":
      text = await parsePdf(selectedFile.content);
      break;
    case "docx":
      text = await parseDocx(selectedFile.content);
      break;
    case "text":
    case "markdown":
      text = decodeText(selectedFile.content);
      break;
  }

  const normalized = text.trim();
  if (!normalized) {
    throw new Error(
      `未能从 ${selectedFile.metadata.filename} 提取文本；扫描版 PDF 暂不支持 OCR`,
    );
  }
  const truncated = normalized.length > MAX_PARSED_CHARS;
  const outputText = truncated
    ? normalized.slice(0, MAX_PARSED_CHARS)
    : normalized;
  return {
    fileId: selectedFile.metadata.id,
    filename: selectedFile.metadata.filename,
    text: outputText,
    charCount: normalized.length,
    truncated,
  };
}

async function parsePdf(content: Buffer): Promise<string> {
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

  return pages.join("\n\n");
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

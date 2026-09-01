import { createHash, randomUUID } from "node:crypto";

import type { SelectedFileRegistry } from "../files/selected-file-registry.js";
import { parseSelectedMaterialDocument } from "../files/parse-selected-file.js";
import { chunkMaterialText, MAX_MATERIAL_CHARS } from "../files/parse-selected-file.js";
import type { BrowserPageReader } from "../browser/types.js";
import {
  materialCriticalTexts,
  materialNumbers,
  minimumDetailChars,
  missingCriticalTexts,
  missingNumbers,
} from "./material-ingestion-inventory.js";
import type {
  ExperienceMaterialChunkView,
  ExperienceMaterialCommitResult,
  ExperienceMaterialCommitter,
  ExperienceMaterialSource,
  ExperienceMaterialTarget,
} from "./material-ingestion-types.js";
import { assertSingleEducationPeriod } from "./material-partition.js";

interface MaterialChunkState extends ExperienceMaterialChunkView {
  recordedText?: string;
}

interface MaterialSession {
  id: string;
  sourceHash: string;
  sourceLabel: string;
  target: ExperienceMaterialTarget;
  capturedAt: string;
  chunks: MaterialChunkState[];
  nextIndex: number;
}

export type MaterialChunkRecordResult =
  | {
      accepted: false;
      chunk: ExperienceMaterialChunkView;
      missingNumbers: string[];
      missingCriticalTexts: string[];
      minimumDetailChars: number;
    }
  | { accepted: true; done: false; chunk: ExperienceMaterialChunkView }
  | { accepted: true; done: true; result: ExperienceMaterialCommitResult };

export class ExperienceMaterialIngestionStore {
  readonly #sessions = new Map<string, MaterialSession>();

  public constructor(
    private readonly files: SelectedFileRegistry,
    private readonly committer: ExperienceMaterialCommitter,
    private readonly browser?: BrowserPageReader,
    private readonly currentUserText?: () => string | undefined,
  ) {}

  public async begin(
    source: ExperienceMaterialSource,
    target: ExperienceMaterialTarget,
  ): Promise<{ sessionId: string; chunk: ExperienceMaterialChunkView }> {
    const material = await this.readMaterial(source);
    if (target.kind === "new" && target.category === "education") {
      assertSingleEducationPeriod(material.chunks.map((chunk) => chunk.text).join("\n"));
    }
    const chunks = material.chunks.map((chunk): MaterialChunkState => ({
      chunkId: chunk.id,
      label: chunk.label,
      text: chunk.text,
      index: chunk.index,
      total: material.chunks.length,
      numbers: materialNumbers(chunk.text),
      criticalTexts: materialCriticalTexts(chunk.text),
      minimumDetailChars: minimumDetailChars(chunk.text.length),
    }));
    if (!chunks.length) throw new Error("材料没有可沉淀的文本");
    const session: MaterialSession = {
      id: randomUUID(), sourceHash: material.sourceHash, sourceLabel: material.sourceLabel,
      target: structuredClone(target), capturedAt: new Date().toISOString(),
      chunks, nextIndex: 0,
    };
    this.#sessions.set(session.id, session);
    return { sessionId: session.id, chunk: view(chunks[0]!) };
  }

  private async readMaterial(
    source: ExperienceMaterialSource,
  ) {
    if (source.kind === "file") {
      const selected = await this.files.read(source.fileId);
      const document = await parseSelectedMaterialDocument(selected);
      return selectedMaterial({
        rawHash: createHash("sha256").update(selected.content).digest("hex"),
        sourceLabel: document.filename, fullText: document.text,
        fullChunks: document.chunks, selectedTexts: source.selectedTexts,
      });
    }
    if (source.kind === "text") {
      const text = this.currentUserText?.()?.trim();
      if (!text) throw new Error("当前用户消息没有可沉淀的文本");
      if (!source.selectedTexts.length) {
        throw new Error("直接聊天文本必须选择经宿主验证的经历原文片段");
      }
      assertMaterialLength(text);
      return selectedMaterial({
        rawHash: hashText(text), sourceLabel: "用户直接补充", fullText: text,
        fullChunks: chunkMaterialText("用户补充", text),
        selectedTexts: source.selectedTexts,
      });
    }
    if (!this.browser) throw new Error("浏览器页面读取服务不可用");
    const page = await this.browser.readActivePage();
    if (!/^https?:\/\//u.test(page.url)) throw new Error("当前网页 URL 无效");
    if (page.textTruncated) throw new Error("当前网页正文被截断，不能冒充完整材料沉淀");
    assertMaterialLength(page.text);
    return selectedMaterial({
      rawHash: hashText(`${page.url}\0${page.text}`),
      sourceLabel: page.title || page.url, fullText: page.text,
      fullChunks: chunkMaterialText("网页正文", page.text),
      selectedTexts: source.selectedTexts,
    });
  }

  public async record(input: {
    sessionId: string;
    chunkId: string;
    detailedText: string;
    coveredCriticalTexts: readonly string[];
  }): Promise<MaterialChunkRecordResult> {
    const session = this.#sessions.get(input.sessionId);
    if (!session) throw new Error("材料沉淀会话不存在或已结束");
    const chunk = session.chunks[session.nextIndex];
    if (!chunk || chunk.chunkId !== input.chunkId) {
      throw new Error("材料分块已变化，请按宿主返回的当前分块继续");
    }
    const detailedText = input.detailedText.trim();
    const missingNumeric = missingNumbers(chunk.numbers, detailedText);
    const missingCritical = missingCriticalTexts(
      chunk.criticalTexts, input.coveredCriticalTexts, detailedText,
    );
    if (detailedText.length < chunk.minimumDetailChars ||
      missingNumeric.length || missingCritical.length) {
      return {
        accepted: false,
        chunk: view(chunk),
        missingNumbers: missingNumeric,
        missingCriticalTexts: missingCritical,
        minimumDetailChars: chunk.minimumDetailChars,
      };
    }
    chunk.recordedText = detailedText;
    session.nextIndex += 1;
    const next = session.chunks[session.nextIndex];
    if (next) return { accepted: true, done: false, chunk: view(next) };
    const result = await this.commit(session);
    this.#sessions.delete(session.id);
    return { accepted: true, done: true, result };
  }

  private commit(session: MaterialSession): Promise<ExperienceMaterialCommitResult> {
    return this.committer.commit({
      target: structuredClone(session.target),
      sourceHash: session.sourceHash,
      sourceLabel: session.sourceLabel,
      capturedAt: session.capturedAt,
      numberCount: new Set(session.chunks.flatMap((chunk) => chunk.numbers)).size,
      criticalOutputCount: new Set(
        session.chunks.flatMap((chunk) => chunk.criticalTexts),
      ).size,
      sections: session.chunks.map((chunk) => ({
        label: chunk.label,
        text: chunk.recordedText ?? "",
      })),
    });
  }
}

function selectedMaterial(input: {
  rawHash: string;
  sourceLabel: string;
  fullText: string;
  fullChunks: ReturnType<typeof chunkMaterialText>;
  selectedTexts?: readonly string[] | undefined;
}) {
  const selections = [...new Set(
    (input.selectedTexts ?? []).map((text) => text.trim()).filter(Boolean),
  )];
  if (!selections.length) {
    return { sourceHash: input.rawHash, sourceLabel: input.sourceLabel,
      chunks: input.fullChunks };
  }
  for (const selection of selections) {
    if (!input.fullText.includes(selection)) {
      throw new Error("所选经历片段不在固定的原始材料中，不能沉淀");
    }
  }
  const text = selections.join("\n\n");
  assertMaterialLength(text);
  return {
    sourceHash: hashText(`${input.rawHash}\0${text}`),
    sourceLabel: input.sourceLabel,
    chunks: selections.flatMap((selection, index) =>
      chunkMaterialText(`所选原文片段 ${index + 1}`, selection)),
  };
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function assertMaterialLength(text: string): void {
  if (text.length > MAX_MATERIAL_CHARS) {
    throw new Error(`材料文本超过 ${MAX_MATERIAL_CHARS.toLocaleString()} 字符，请拆分后提交`);
  }
}

function view(chunk: MaterialChunkState): ExperienceMaterialChunkView {
  const { recordedText: _recorded, ...value } = chunk;
  return structuredClone(value);
}

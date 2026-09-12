import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, extname } from "node:path";

import type {
  MaterialSelectedFileContent,
  MaterialSelectedFileMetadata,
  SelectedFileContent,
  SelectedFileMetadata,
  SupportedImportFileType,
  SupportedMaterialFileType,
} from "./types.js";

const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
export const FILE_TYPES: Record<string, SupportedImportFileType> = {
  ".pdf": "pdf",
  ".docx": "docx",
  ".txt": "text",
  ".md": "markdown",
  ".markdown": "markdown",
};
const MATERIAL_FILE_TYPES: Record<string, SupportedMaterialFileType> = {
  ...FILE_TYPES,
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpeg",
};

type AnyMetadata = SelectedFileMetadata | MaterialSelectedFileMetadata;

interface RegisteredFile {
  metadata: MaterialSelectedFileMetadata;
  content: Uint8Array;
}

interface FileIdentity {
  device: number;
  inode: number;
  sizeBytes: number;
  modifiedAtMs: number;
  createdAtMs: number;
}

export class SelectedFileRegistry {
  readonly #files = new Map<string, RegisteredFile>();

  public async registerPaths(paths: string[]): Promise<SelectedFileMetadata[]> {
    const prepared = await Promise.all(paths.map((path) => this.#inspect(path, false)));
    this.#commit(prepared);
    return prepared.flatMap(({ metadata }) => {
      const selected = toSelectedMetadata(metadata);
      return selected ? [selected] : [];
    });
  }

  public async replacePaths(paths: string[]): Promise<SelectedFileMetadata[]> {
    const prepared = await Promise.all(paths.map((path) => this.#inspect(path, false)));
    this.#files.clear();
    this.#commit(prepared);
    return prepared.flatMap(({ metadata }) => {
      const selected = toSelectedMetadata(metadata);
      return selected ? [selected] : [];
    });
  }

  public async registerMaterialPaths(paths: string[]): Promise<MaterialSelectedFileMetadata[]> {
    const prepared = await Promise.all(paths.map((path) => this.#inspect(path, true)));
    this.#commit(prepared);
    return prepared.map(({ metadata }) => ({ ...metadata }));
  }

  public list(): SelectedFileMetadata[] {
    return [...this.#files.values()]
      .map(({ metadata }) => toSelectedMetadata(metadata))
      .filter((metadata): metadata is SelectedFileMetadata => metadata !== undefined);
  }

  public listMaterial(): MaterialSelectedFileMetadata[] {
    return [...this.#files.values()].map(({ metadata }) => ({ ...metadata }));
  }

  public async read(fileId: string): Promise<SelectedFileContent> {
    const file = this.#required(fileId);
    const metadata = toSelectedMetadata(file.metadata);
    if (!metadata) throw new Error("图片材料不能进入对话附件通道");
    return { metadata, content: Buffer.from(file.content) };
  }

  public async readMaterial(fileId: string): Promise<MaterialSelectedFileContent> {
    const file = this.#required(fileId);
    return { metadata: { ...file.metadata }, content: Buffer.from(file.content) };
  }

  public remove(fileId: string): void {
    if (!this.#files.delete(fileId)) throw new Error(`未找到用户明确选择的附件：${fileId}`);
  }

  public clear(): void {
    this.#files.clear();
  }

  async #inspect(inputPath: string, allowImages: boolean): Promise<RegisteredFile> {
    const inputStat = await lstat(inputPath).catch(() => undefined);
    if (!inputStat || inputStat.isSymbolicLink()) {
      throw new Error("为了保护本地文件边界，不能选择符号链接或已失效的附件");
    }
    const resolvedPath = await realpath(inputPath);
    const filename = basename(resolvedPath);
    const type = MATERIAL_FILE_TYPES[extname(resolvedPath).toLowerCase()];
    if (!type || (!allowImages && !isConversationType(type))) {
      throw new Error(`不支持的附件类型：${filename}；仅支持 PDF、DOCX、TXT、MD`);
    }
    const handle = await open(resolvedPath, "r").catch(() => {
      throw invalidatedFileError(filename);
    });
    try {
      const before = await handle.stat();
      if (!before.isFile()) throw new Error(`附件不是普通文件：${inputPath}`);
      if (before.size > MAX_FILE_SIZE) throw new Error(`附件超过 ${MAX_FILE_SIZE_MB}MB：${filename}`);
      const content = await handle.readFile();
      const after = await handle.stat();
      if (!sameIdentity(identityFromStat(before), identityFromStat(after))) throw invalidatedFileError(filename);
      return {
        metadata: { id: `attachment-${randomUUID()}`, filename, type, sizeBytes: content.byteLength },
        content: new Uint8Array(content),
      };
    } finally {
      await handle.close();
    }
  }

  #required(fileId: string): RegisteredFile {
    const file = this.#files.get(fileId);
    if (!file) throw new Error(`未找到用户明确选择的附件：${fileId}`);
    return file;
  }

  #commit(files: RegisteredFile[]): void {
    for (const file of files) this.#files.set(file.metadata.id, file);
  }
}

function isConversationType(type: SupportedMaterialFileType): type is SupportedImportFileType {
  return type === "pdf" || type === "docx" || type === "text" || type === "markdown";
}

function toSelectedMetadata(metadata: AnyMetadata): SelectedFileMetadata | undefined {
  return isConversationType(metadata.type) ? { ...metadata, type: metadata.type } : undefined;
}

function identityFromStat(value: Stats): FileIdentity {
  return {
    device: Number(value.dev),
    inode: Number(value.ino),
    sizeBytes: Number(value.size),
    modifiedAtMs: Number(value.mtimeMs),
    createdAtMs: Number(value.birthtimeMs),
  };
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return (
    left.device === right.device &&
    left.inode === right.inode &&
    left.sizeBytes === right.sizeBytes &&
    left.modifiedAtMs === right.modifiedAtMs &&
    left.createdAtMs === right.createdAtMs
  );
}

function invalidatedFileError(filename: string): Error {
  return new Error(`附件“${filename}”已失效或被替换，请重新选择`);
}

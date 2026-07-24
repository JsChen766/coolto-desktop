import { randomUUID } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import type {
  SelectedFileContent,
  SelectedFileMetadata,
  SupportedImportFileType,
} from "./types.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_TYPES = new Map<string, SupportedImportFileType>([
  [".pdf", "pdf"],
  [".docx", "docx"],
  [".txt", "text"],
  [".md", "markdown"],
  [".markdown", "markdown"],
]);

interface RegisteredFile {
  metadata: SelectedFileMetadata;
  path: string;
  identity: FileIdentity;
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

  public async registerPaths(
    paths: string[],
  ): Promise<SelectedFileMetadata[]> {
    const prepared = await Promise.all(
      paths.map((path) => this.#inspect(path)),
    );
    return this.#commit(prepared);
  }

  public async replacePaths(
    paths: string[],
  ): Promise<SelectedFileMetadata[]> {
    const prepared = await Promise.all(
      paths.map((path) => this.#inspect(path)),
    );
    this.#files.clear();
    return this.#commit(prepared);
  }

  public list(): SelectedFileMetadata[] {
    return [...this.#files.values()].map(({ metadata }) => ({
      ...metadata,
    }));
  }

  public async read(fileId: string): Promise<SelectedFileContent> {
    const file = this.#files.get(fileId);
    if (!file) {
      throw new Error(`未找到用户明确选择的附件：${fileId}`);
    }
    const before = await currentIdentity(file);
    if (!sameIdentity(file.identity, before)) {
      throw invalidatedFileError(file.metadata.filename);
    }
    const content = await readFile(file.path).catch(() => {
      throw invalidatedFileError(file.metadata.filename);
    });
    const after = await currentIdentity(file);
    if (!sameIdentity(file.identity, after)) {
      throw invalidatedFileError(file.metadata.filename);
    }
    return {
      metadata: { ...file.metadata },
      content,
    };
  }

  public remove(fileId: string): void {
    if (!this.#files.delete(fileId)) {
      throw new Error(`未找到用户明确选择的附件：${fileId}`);
    }
  }

  public clear(): void {
    this.#files.clear();
  }

  async #inspect(inputPath: string): Promise<RegisteredFile> {
    const resolvedPath = await realpath(inputPath);
    const fileStat = await stat(resolvedPath);
    if (!fileStat.isFile()) {
      throw new Error(`附件不是普通文件：${inputPath}`);
    }
    if (fileStat.size > MAX_FILE_SIZE) {
      throw new Error(`附件超过 10MB：${basename(resolvedPath)}`);
    }
    const type = FILE_TYPES.get(extname(resolvedPath).toLowerCase());
    if (!type) {
      throw new Error(
        `不支持的附件类型：${basename(resolvedPath)}；仅支持 PDF、DOCX、TXT、MD`,
      );
    }
    const metadata: SelectedFileMetadata = {
      id: `attachment-${randomUUID()}`,
      filename: basename(resolvedPath),
      type,
      sizeBytes: fileStat.size,
    };
    return {
      metadata,
      path: resolvedPath,
      identity: identityFromStat(fileStat),
    };
  }

  #commit(files: RegisteredFile[]): SelectedFileMetadata[] {
    for (const file of files) {
      this.#files.set(file.metadata.id, file);
    }
    return files.map(({ metadata }) => ({ ...metadata }));
  }
}

async function currentIdentity(file: RegisteredFile): Promise<FileIdentity> {
  try {
    return identityFromStat(await stat(file.path));
  } catch {
    throw invalidatedFileError(file.metadata.filename);
  }
}

function identityFromStat(
  value: Awaited<ReturnType<typeof stat>>,
): FileIdentity {
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

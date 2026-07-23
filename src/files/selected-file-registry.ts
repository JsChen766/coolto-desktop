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
}

export class SelectedFileRegistry {
  readonly #files = new Map<string, RegisteredFile>();

  public async registerPaths(
    paths: string[],
  ): Promise<SelectedFileMetadata[]> {
    const registered: SelectedFileMetadata[] = [];

    for (const inputPath of paths) {
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

      const id = `attachment-${this.#files.size + 1}`;
      const metadata = {
        id,
        filename: basename(resolvedPath),
        type,
        sizeBytes: fileStat.size,
      };
      this.#files.set(id, { metadata, path: resolvedPath });
      registered.push(metadata);
    }

    return registered;
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
    return {
      metadata: { ...file.metadata },
      content: await readFile(file.path),
    };
  }
}

import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";

import {
  validateDeliveryResumeContent,
  validateDeliveryResumeFile,
  type ValidatedDeliveryResumeFile,
} from "./file-validation.js";
import { replaceDeliveryResumeFile } from "./atomic-file.js";
import {
  emptyDeliveryResumeManifest,
  isDeliveryResumeManifest,
  type DeliveryResumeManifest,
} from "./manifest.js";
import type {
  DeliveryResumeFile,
  DeliveryResumeFileCodec,
  DeliveryResumeFileSource,
} from "./types.js";

export class DeliveryResumeFileRepository implements DeliveryResumeFileSource {
  readonly #manifestPath: string;
  readonly #stagingDirectory: string;
  #initialized = false;

  public constructor(
    private readonly ownerId: string,
    private readonly directory: string,
    private readonly codec: DeliveryResumeFileCodec,
  ) {
    this.#manifestPath = join(directory, "manifest.coolto");
    this.#stagingDirectory = join(directory, "staging");
  }

  public async list(): Promise<DeliveryResumeFile[]> {
    const manifest = await this.#readManifest();
    return structuredClone(manifest.files.sort(compareFiles));
  }

  public async get(fileId: string): Promise<DeliveryResumeFile> {
    assertFileId(fileId);
    const file = (await this.#readManifest()).files.find((item) => item.id === fileId);
    if (!file) throw new Error("用户原始简历不存在");
    return structuredClone(file);
  }

  public async importFile(path: string): Promise<DeliveryResumeFile> {
    return this.#importValidated(await validateDeliveryResumeFile(path));
  }

  public async importContent(
    filename: string,
    content: Uint8Array,
  ): Promise<DeliveryResumeFile> {
    return this.#importValidated(
      validateDeliveryResumeContent(filename, content),
    );
  }

  async #importValidated(
    validated: ValidatedDeliveryResumeFile,
  ): Promise<DeliveryResumeFile> {
    const manifest = await this.#readManifest();
    const duplicate = manifest.files.find(
      (file) => file.sha256 === validated.metadata.sha256,
    );
    if (duplicate) return structuredClone(duplicate);
    const metadata = {
      ...validated.metadata,
      preferred: manifest.files.length === 0,
    };
    await this.#writeBlob(metadata.id, validated.content);
    try {
      manifest.files.push(metadata);
      await this.#writeManifest(manifest);
    } catch (error) {
      await unlink(this.#blobPath(metadata.id)).catch(() => undefined);
      throw error;
    }
    return structuredClone(metadata);
  }

  public async rename(fileId: string, title: string): Promise<DeliveryResumeFile> {
    const nextTitle = title.trim();
    if (!nextTitle) throw new Error("投递文件名称不能为空");
    if (nextTitle.length > 240) throw new Error("投递文件名称不能超过 240 个字符");
    return this.#update(fileId, (file) => ({
      ...file,
      title: nextTitle,
      updatedAt: new Date().toISOString(),
    }));
  }

  public async setPreferred(fileId: string): Promise<DeliveryResumeFile> {
    assertFileId(fileId);
    const manifest = await this.#readManifest();
    const selected = manifest.files.find((file) => file.id === fileId);
    if (!selected) throw new Error("用户原始简历不存在");
    const now = new Date().toISOString();
    manifest.files = manifest.files.map((file) => ({
      ...file,
      preferred: file.id === fileId,
      ...(file.id === fileId ? { updatedAt: now } : {}),
    }));
    await this.#writeManifest(manifest);
    return structuredClone(manifest.files.find((file) => file.id === fileId)!);
  }

  public async delete(fileId: string): Promise<void> {
    assertFileId(fileId);
    const manifest = await this.#readManifest();
    const removed = manifest.files.find((file) => file.id === fileId);
    if (!removed) throw new Error("用户原始简历不存在");
    manifest.files = manifest.files.filter((file) => file.id !== fileId);
    if (removed.preferred && manifest.files[0]) manifest.files[0].preferred = true;
    await this.#writeManifest(manifest);
    await unlink(this.#blobPath(fileId)).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  public async stage(fileId: string): Promise<string> {
    const file = await this.get(fileId);
    const content = await this.#readBlob(file);
    await mkdir(this.#stagingDirectory, { recursive: true, mode: 0o700 });
    const stage = join(
      this.#stagingDirectory,
      `${randomUUID()}-${basename(file.originalFilename)}`,
    );
    await writeFile(stage, content, { mode: 0o600 });
    return stage;
  }

  public async clearStaging(): Promise<void> {
    await rm(this.#stagingDirectory, { recursive: true, force: true });
  }

  public async clearAll(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
  }

  async #update(
    fileId: string,
    update: (file: DeliveryResumeFile) => DeliveryResumeFile,
  ): Promise<DeliveryResumeFile> {
    assertFileId(fileId);
    const manifest = await this.#readManifest();
    const index = manifest.files.findIndex((file) => file.id === fileId);
    if (index < 0) throw new Error("用户原始简历不存在");
    manifest.files[index] = update(manifest.files[index]!);
    await this.#writeManifest(manifest);
    return structuredClone(manifest.files[index]!);
  }

  async #readManifest(): Promise<DeliveryResumeManifest> {
    await this.#initialize();
    try {
      const decoded = this.codec.decodeText(await readFile(this.#manifestPath));
      const parsed = JSON.parse(decoded) as unknown;
      if (!isDeliveryResumeManifest(parsed) || parsed.ownerId !== this.ownerId) {
        throw new Error("本地投递文件清单无效或不属于当前用户");
      }
      return parsed;
    } catch (error: unknown) {
      if (!isMissing(error)) throw error;
      return emptyDeliveryResumeManifest(this.ownerId);
    }
  }

  async #writeManifest(manifest: DeliveryResumeManifest): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.#manifestPath}.${randomUUID()}.tmp`;
    await writeFile(
      temporary,
      this.codec.encodeText(JSON.stringify(manifest)),
      { mode: 0o600 },
    );
    await replaceDeliveryResumeFile(temporary, this.#manifestPath);
  }

  async #writeBlob(fileId: string, content: Uint8Array): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = this.#blobPath(fileId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await writeFile(temporary, this.codec.encodeBytes(content), { mode: 0o600 });
    await replaceDeliveryResumeFile(temporary, destination);
  }

  async #readBlob(file: DeliveryResumeFile): Promise<Uint8Array> {
    let content: Uint8Array;
    try {
      content = this.codec.decodeBytes(await readFile(this.#blobPath(file.id)));
    } catch (error: unknown) {
      if (!isMissing(error)) throw error;
      throw new Error(`用户原始简历“${file.title}”的本地文件已缺失`);
    }
    const hash = createHash("sha256").update(content).digest("hex");
    if (content.byteLength !== file.sizeBytes || hash !== file.sha256) {
      throw new Error(`用户原始简历“${file.title}”完整性校验失败`);
    }
    return content;
  }

  #blobPath(fileId: string): string {
    return join(this.directory, `${fileId}.blob.coolto`);
  }

  async #initialize(): Promise<void> {
    if (this.#initialized) return;
    this.#initialized = true;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await rm(this.#stagingDirectory, { recursive: true, force: true });
    const names = await readdir(this.directory);
    await Promise.all(names.filter((name) => name.endsWith(".tmp"))
      .map((name) => unlink(join(this.directory, name)).catch(() => undefined)));
  }
}

function assertFileId(value: string): void {
  if (!/^[0-9a-f-]{36}$/iu.test(value)) throw new Error("无效的投递文件 ID");
}

function compareFiles(left: DeliveryResumeFile, right: DeliveryResumeFile): number {
  return Number(right.preferred) - Number(left.preferred) ||
    right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT";
}

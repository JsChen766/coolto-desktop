import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type {
  LocalResumeDraft,
  ResumeDraftCodec,
} from "../../../resume/draft/types.js";

export class ResumeDraftFileRepository {
  public constructor(
    private readonly ownerId: string,
    private readonly directory: string,
    private readonly codec: ResumeDraftCodec,
  ) {}

  public async list(): Promise<LocalResumeDraft[]> {
    await this.ensureDirectory();
    const filenames = await readdir(this.directory);
    const records = await Promise.all(
      filenames
        .filter((filename) => filename.endsWith(".coolto-resume"))
        .map((filename) => this.read(join(this.directory, filename))),
    );
    return records
      .filter((draft): draft is LocalResumeDraft => draft !== undefined)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async get(artifactId: string): Promise<LocalResumeDraft> {
    assertArtifactId(artifactId);
    const draft = await this.read(this.pathFor(artifactId));
    if (!draft) throw new Error("本地简历草稿不存在");
    return draft;
  }

  public async delete(artifactId: string): Promise<void> {
    assertArtifactId(artifactId);
    try {
      await unlink(this.pathFor(artifactId));
    } catch (error: unknown) {
      if (!isMissingFileError(error)) throw error;
    }
  }

  public async clearAll(): Promise<void> {
    await rm(this.directory, { recursive: true, force: true });
  }

  public async save(draft: LocalResumeDraft): Promise<void> {
    assertArtifactId(draft.artifactId);
    if (draft.ownerId !== this.ownerId) {
      throw new Error("拒绝保存其他用户的本地简历草稿");
    }
    await this.ensureDirectory();
    const destination = this.pathFor(draft.artifactId);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    const encoded = this.codec.encode(JSON.stringify(draft));
    await writeFile(temporary, encoded, { mode: 0o600 });
    await rename(temporary, destination);
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  private pathFor(artifactId: string): string {
    return join(this.directory, `${artifactId}.coolto-resume`);
  }

  private async read(path: string): Promise<LocalResumeDraft | undefined> {
    try {
      const decoded = this.codec.decode(await readFile(path));
      const parsed = JSON.parse(decoded) as unknown;
      if (!isLocalResumeDraft(parsed) || parsed.ownerId !== this.ownerId) {
        return undefined;
      }
      return structuredClone(parsed);
    } catch (error: unknown) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }
}

function assertArtifactId(value: string): void {
  if (!/^[0-9a-f-]{36}$/iu.test(value)) {
    throw new Error("无效的本地简历 ID");
  }
}

function isLocalResumeDraft(value: unknown): value is LocalResumeDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<LocalResumeDraft>;
  return (
    draft.schemaVersion === "local-resume-draft-v1" &&
    typeof draft.artifactId === "string" &&
    typeof draft.ownerId === "string" &&
    Array.isArray(draft.conversationIds) &&
    typeof draft.title === "string" &&
    typeof draft.createdAt === "string" &&
    typeof draft.updatedAt === "string" &&
    Boolean(draft.workspace) &&
    Array.isArray(draft.checkpoints) &&
    "pendingChange" in draft &&
    "cloudLink" in draft
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

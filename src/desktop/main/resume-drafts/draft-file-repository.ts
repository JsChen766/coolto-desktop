import { AsyncLocalStorage } from "node:async_hooks";
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
import {
  assertNoAmbiguousLegacyDirectory,
  requireScopedEnvelopeDigest,
} from "../../../privacy/local-scope.js";

interface ArtifactOperationContext {
  repositoryKey: string;
  directoryKey: string;
  artifactId: string | undefined;
  active: boolean;
}
const operationContext = new AsyncLocalStorage<ArtifactOperationContext>();
const pendingWrites = new Map<string, Promise<void>>();
export class ResumeDraftFileRepository {
  public constructor(
    private readonly ownerId: string,
    private readonly directory: string,
    private readonly codec: ResumeDraftCodec,
    private readonly scopeDigest?: string,
    private readonly legacyDirectory?: string,
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
    const destination = this.pathFor(draft.artifactId);
    await this.ensureDirectory();
    await withWriteLock(`${this.directory}\0${draft.artifactId}`, async () => {
      const current = await this.read(destination);
      if (
        current &&
        current.workspace.revision > draft.workspace.revision &&
        !isPendingChangeRollback(current, draft)
      ) {
        throw new Error("拒绝覆盖较新的本地简历草稿");
      }
      const temporary = `${destination}.${randomUUID()}.tmp`;
      const value = this.scopeDigest
        ? { scopeDigest: this.scopeDigest, ownerId: this.ownerId, value: draft }
        : draft;
      const encoded = this.codec.encode(JSON.stringify(value));
      await writeFile(temporary, encoded, { mode: 0o600 });
      await retryRename(temporary, destination);
    });
  }
  public async withArtifactOperationLock<T>(
    artifactId: string | undefined,
    task: () => Promise<T>,
  ): Promise<T> {
    if (artifactId) assertArtifactId(artifactId);
    const directoryKey = `${this.directory}\0operation`;
    const repositoryKey = `${this.ownerId}\0${this.directory}`;
    const current = operationContext.getStore();
    if (
      current?.active &&
      current.repositoryKey === repositoryKey &&
      current.directoryKey === directoryKey &&
      (current.artifactId === artifactId ||
        current.artifactId === undefined ||
        artifactId === undefined)
    ) {
      return task();
    }
    await this.ensureDirectory();
    const marker: ArtifactOperationContext = {
      repositoryKey,
      directoryKey,
      artifactId,
      active: true,
    };
    return withWriteLock(
      directoryKey,
      () => withWriteLock(
        `${this.directory}\0${artifactId ?? "*"}\0operation`,
        () => operationContext.run(marker, async () => {
          try {
            return await task();
          } finally {
            marker.active = false;
          }
        }),
      ),
    );
  }

  private async ensureDirectory(): Promise<void> {
    if (this.legacyDirectory) {
      await assertNoAmbiguousLegacyDirectory(this.legacyDirectory, this.directory);
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }

  private pathFor(artifactId: string): string {
    return join(this.directory, `${artifactId}.coolto-resume`);
  }

  private async read(path: string): Promise<LocalResumeDraft | undefined> {
    try {
      const decoded = this.codec.decode(await readFile(path));
      const parsed = JSON.parse(decoded) as unknown;
      const value = this.scopeDigest
        ? requireScopedEnvelopeDigest<LocalResumeDraft>(parsed, this.scopeDigest, this.ownerId)
        : parsed;
      if (!isLocalResumeDraft(value) || value.ownerId !== this.ownerId) {
        if (this.scopeDigest) throw new Error("本地简历草稿来源与当前 API 账号不匹配");
        return undefined;
      }
      return structuredClone(value);
    } catch (error: unknown) {
      if (isMissingFileError(error)) return undefined;
      throw error;
    }
  }
}

async function withWriteLock<T>(
  key: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = pendingWrites.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const marker = next.then(() => undefined, () => undefined);
  pendingWrites.set(key, marker);
  return next.finally(() => {
    if (pendingWrites.get(key) === marker) pendingWrites.delete(key);
  });
}
function isPendingChangeRollback(
  current: LocalResumeDraft,
  incoming: LocalResumeDraft,
): boolean {
  const pending = current.pendingChange;
  if (!pending || incoming.pendingChange !== null) return false;
  return pending.base.revision === incoming.workspace.revision &&
    JSON.stringify(pending.base.structure) ===
      JSON.stringify(incoming.workspace.structure) &&
    JSON.stringify(pending.base.bindings) ===
      JSON.stringify(incoming.workspace.bindings);
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

const RENAME_RETRY_ATTEMPTS = 5;

async function retryRename(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error: unknown) {
      if (attempt >= RENAME_RETRY_ATTEMPTS || !isRetryableRenameError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 80 * attempt));
    }
  }
}

function isRetryableRenameError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

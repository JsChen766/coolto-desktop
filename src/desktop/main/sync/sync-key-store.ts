import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { safeStorage } from "electron";

export class SyncKeyStore {
  readonly #path: string;

  public constructor(private readonly directory: string) {
    this.#path = join(directory, "payload-key.coolto");
  }

  public async loadOrCreate(): Promise<Buffer> {
    requireEncryption();
    try {
      const encrypted = await readFile(this.#path);
      const decoded = Buffer.from(
        safeStorage.decryptString(encrypted),
        "base64",
      );
      if (decoded.length !== 32) throw new Error("同步存储密钥长度无效");
      return decoded;
    } catch (error: unknown) {
      if (!isMissingFileError(error)) throw error;
    }

    const key = randomBytes(32);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const encrypted = safeStorage.encryptString(key.toString("base64"));
    await writeFile(temporary, encrypted, { mode: 0o600 });
    await rename(temporary, this.#path);
    return key;
  }
}

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝打开本地同步数据库");
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

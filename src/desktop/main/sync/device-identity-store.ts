import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { app, safeStorage } from "electron";

import { canonicalApiOrigin } from "../../../privacy/export-canonical.js";

import { createUuidV7 } from "../../../sync/uuid-v7.js";
interface StoredIdentities {
  version: 1;
  entries: Record<string, string>;
}

export class DeviceIdentityStore {
  readonly #path: string;

  public constructor() {
    this.#path = join(app.getPath("userData"), "sync", "device-identities.coolto");
  }

  public async getOrCreate(apiBaseUrl: string, email: string): Promise<string> {
    const identities = await this.#load();
    const key = accountKey(apiBaseUrl, email);
    const existing = identities.entries[key];
    if (existing) return existing;

    const deviceId = createUuidV7();
    identities.entries[key] = deviceId;
    await this.#save(identities);
    return deviceId;
  }
  public async clear(apiBaseUrl: string, email: string): Promise<void> {
    const identities = await this.#load();
    delete identities.entries[accountKey(apiBaseUrl, email)];
    if (Object.keys(identities.entries).length === 0) {
      await unlink(this.#path).catch((error: unknown) => {
        if (!isMissingFileError(error)) throw error;
      });
      return;
    }
    await this.#save(identities);
  }

  async #load(): Promise<StoredIdentities> {
    try {
      const encrypted = await readFile(this.#path);
      const parsed = JSON.parse(decrypt(encrypted)) as unknown;
      if (isStoredIdentities(parsed)) return parsed;
      throw new Error("本地设备身份文件格式无效");
    } catch (error: unknown) {
      if (isMissingFileError(error)) {
        return { version: 1, entries: {} };
      }
      throw error;
    }
  }

  async #save(identities: StoredIdentities): Promise<void> {
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encrypt(JSON.stringify(identities)), {
      mode: 0o600,
    });
    await rename(temporary, this.#path);
  }
}

function accountKey(apiBaseUrl: string, email: string): string {
  return createHash("sha256")
    .update(canonicalApiOrigin(apiBaseUrl))
    .update("\0")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

function encrypt(value: string): Buffer {
  requireEncryption();
  return safeStorage.encryptString(value);
}

function decrypt(value: Buffer): string {
  requireEncryption();
  return safeStorage.decryptString(value);
}

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝保存同步设备身份");
  }
}

function isStoredIdentities(value: unknown): value is StoredIdentities {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredIdentities>;
  return (
    candidate.version === 1 &&
    Boolean(candidate.entries) &&
    typeof candidate.entries === "object" &&
    Object.values(candidate.entries).every(
      (entry) => typeof entry === "string" && /^[0-9a-f-]{36}$/iu.test(entry),
    )
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

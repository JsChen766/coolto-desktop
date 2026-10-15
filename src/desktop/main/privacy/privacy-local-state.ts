import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { app, safeStorage } from "electron";

import { canonicalApiOrigin } from "../../../privacy/export-canonical.js";
import { localScopeDigest } from "../../../privacy/local-scope.js";
import {
  emptyStoredPrivacyFile,
  parseStoredPrivacyFile,
  type CachedPrivacyConsent,
  type StoredPrivacyFile,
} from "./privacy-local-file.js";

export type { CachedPrivacyConsent } from "./privacy-local-file.js";

export class PrivacyLocalState {
  readonly #path: string;
  readonly #apiBaseUrl: string;
  public constructor(apiBaseUrl: string, path = join(app.getPath("userData"), "privacy", "consent.coolto")) {
    this.#apiBaseUrl = canonicalApiOrigin(apiBaseUrl);
    this.#path = path;
  }

  public async get(accountId?: string): Promise<CachedPrivacyConsent | undefined> {
    const file = await this.#load();
    return file.entries[scopeKey(this.#apiBaseUrl, accountId)];
  }

  public async set(accountId: string | undefined, value: CachedPrivacyConsent): Promise<void> {
    const file = await this.#load();
    file.entries[scopeKey(this.#apiBaseUrl, accountId)] = structuredClone(value);
    await this.#save(file);
  }

  public async clear(accountId?: string): Promise<void> {
    const file = await this.#load();
    delete file.entries[scopeKey(this.#apiBaseUrl, accountId)];
    if (Object.keys(file.entries).length === 0) {
      await this.#discard();
      return;
    }
    await this.#save(file);
  }

  public async clearAccountAndAnonymous(accountId: string): Promise<void> {
    const file = await this.#load();
    delete file.entries[scopeKey(this.#apiBaseUrl, accountId)];
    delete file.entries.anonymous;
    if (Object.keys(file.entries).length === 0) {
      await this.#discard();
      return;
    }
    await this.#save(file);
  }

  public async clearAll(): Promise<void> {
    await this.#discard();
  }

  async #load(): Promise<StoredPrivacyFile> {
    const empty = emptyStoredPrivacyFile(this.#apiBaseUrl);
    try {
      requireEncryption();
      const parsed = JSON.parse(safeStorage.decryptString(await readFile(this.#path))) as unknown;
      const file = parseStoredPrivacyFile(parsed, this.#apiBaseUrl);
      if (file) return file;
      await this.#discard();
      return empty;
    } catch (error: unknown) {
      if (isMissing(error)) return empty;
      if (isEncryptionUnavailable(error)) throw error;
      await this.#discard();
      return empty;
    }
  }

  async #discard(): Promise<void> {
    await unlink(this.#path).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  async #save(file: StoredPrivacyFile): Promise<void> {
    requireEncryption();
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    const handle = await open(temporary, "w", 0o600);
    let failure: unknown;
    try {
      await handle.writeFile(safeStorage.encryptString(JSON.stringify(file)));
      await handle.sync();
    } catch (error: unknown) {
      failure = error;
    }
    try {
      await handle.close();
    } catch (error: unknown) {
      failure ??= error;
    }
    if (failure) {
      await unlink(temporary).catch(() => undefined);
      throw failure;
    }
    try {
      await rename(temporary, this.#path);
    } catch (error: unknown) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}

function scopeKey(apiBaseUrl: string, accountId?: string): string {
  return accountId ? localScopeDigest(apiBaseUrl, accountId) : "anonymous";
}

function requireEncryption(): void {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("系统安全存储不可用，拒绝保存隐私状态");
}

function isEncryptionUnavailable(error: unknown): boolean {
  return error instanceof Error && error.message.includes("系统安全存储不可用");
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return Reflect.get(error, "code") === "ENOENT";
}

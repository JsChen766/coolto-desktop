import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { app, safeStorage } from "electron";

import { canonicalApiOrigin } from "../../../privacy/export-canonical.js";
import { localScopeDigest } from "../../../privacy/local-scope.js";

export interface CachedPrivacyConsent {
  policyVersion: string;
  contentHash: string;
  status: "accepted" | "declined" | "withdrawn";
  acceptedAt: string | null;
  decisionAt: string;
}

interface StoredPrivacyFile {
  version: 1;
  apiBaseUrl: string;
  entries: Record<string, CachedPrivacyConsent>;
}

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
      await unlink(this.#path).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
      return;
    }
    await this.#save(file);
  }

  public async clearAccountAndAnonymous(accountId: string): Promise<void> {
    const file = await this.#load();
    delete file.entries[scopeKey(this.#apiBaseUrl, accountId)];
    delete file.entries.anonymous;
    if (Object.keys(file.entries).length === 0) {
      await unlink(this.#path).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
      return;
    }
    await this.#save(file);
  }

  public async clearAll(): Promise<void> {
    await unlink(this.#path).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
  }

  async #load(): Promise<StoredPrivacyFile> {
    try {
      requireEncryption();
      const decrypted = safeStorage.decryptString(await readFile(this.#path));
      const parsed = JSON.parse(decrypted) as unknown;
      if (!isStoredFile(parsed, this.#apiBaseUrl)) throw new Error("本地隐私状态格式无效");
      return parsed;
    } catch (error: unknown) {
      if (isMissing(error)) return { version: 1, apiBaseUrl: this.#apiBaseUrl, entries: {} };
      throw error;
    }
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

function isStoredFile(value: unknown, apiBaseUrl: string): value is StoredPrivacyFile {
  if (!value || typeof value !== "object") return false;
  const file = value as Partial<StoredPrivacyFile>;
  return file.version === 1 && file.apiBaseUrl === apiBaseUrl &&
    Boolean(file.entries) && typeof file.entries === "object" &&
    Object.values(file.entries).every(isCachedConsent);
}

function isCachedConsent(value: unknown): value is CachedPrivacyConsent {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CachedPrivacyConsent>;
  return typeof entry.policyVersion === "string" && typeof entry.contentHash === "string" &&
    ["accepted", "declined", "withdrawn"].includes(entry.status ?? "") &&
    (entry.acceptedAt === null || typeof entry.acceptedAt === "string") &&
    typeof entry.decisionAt === "string";
}

function isMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return Reflect.get(error, "code") === "ENOENT";
}

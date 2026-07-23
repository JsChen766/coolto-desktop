import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

import { app, safeStorage } from "electron";

import type {
  AuthSessionStore,
  StoredAuthSession,
} from "../../auth/session-store.js";

export class ElectronAuthSessionStore implements AuthSessionStore {
  readonly #apiBaseUrl: string;
  readonly #path: string;

  public constructor(apiBaseUrl: string) {
    this.#apiBaseUrl = apiBaseUrl.replace(/\/+$/, "");
    this.#path = join(app.getPath("userData"), "auth", "session.coolto");
  }

  public async load(): Promise<StoredAuthSession | undefined> {
    try {
      const encrypted = await readFile(this.#path);
      const session = JSON.parse(decrypt(encrypted)) as unknown;
      if (!isStoredSession(session, this.#apiBaseUrl)) {
        await this.clear();
        return undefined;
      }
      return session;
    } catch (error: unknown) {
      if (isMissingFileError(error)) {
        return undefined;
      }
      throw error;
    }
  }

  public async save(session: StoredAuthSession): Promise<void> {
    if (!isStoredSession(session, this.#apiBaseUrl)) {
      throw new Error("拒绝保存无效的 Coolto 登录状态");
    }
    await mkdir(dirname(this.#path), { recursive: true, mode: 0o700 });
    const temporary = `${this.#path}.${randomUUID()}.tmp`;
    await writeFile(temporary, encrypt(JSON.stringify(session)), {
      mode: 0o600,
    });
    await rename(temporary, this.#path);
  }

  public async clear(): Promise<void> {
    await unlink(this.#path).catch((error: unknown) => {
      if (!isMissingFileError(error)) {
        throw error;
      }
    });
  }
}

function encrypt(value: string): Buffer {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，拒绝保存登录状态");
  }
  return safeStorage.encryptString(value);
}

function decrypt(value: Buffer): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("系统安全存储不可用，无法读取登录状态");
  }
  return safeStorage.decryptString(value);
}

function isStoredSession(
  value: unknown,
  apiBaseUrl: string,
): value is StoredAuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredAuthSession>;
  return (
    candidate.version === 1 &&
    candidate.apiBaseUrl === apiBaseUrl &&
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0 &&
    /^[A-Za-z0-9._~-]+$/.test(candidate.accessToken)
  );
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

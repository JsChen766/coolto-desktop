import { AsyncEntry } from "@napi-rs/keyring";

import type {
  AuthSessionStore,
  StoredAuthSession,
} from "./session-store.js";

const SESSION_VERSION = 1;
const KEYCHAIN_SERVICE = "com.coolto.local-agent.session";

interface KeychainEntry {
  getPassword(): Promise<string | undefined>;
  setPassword(secret: string): Promise<void>;
  deleteCredential(): Promise<boolean>;
}

export interface KeychainSessionStoreOptions {
  apiBaseUrl: string;
  entry?: KeychainEntry;
}

export class KeychainSessionStore implements AuthSessionStore {
  readonly #apiBaseUrl: string;
  readonly #entry: KeychainEntry;

  public constructor(options: KeychainSessionStoreOptions) {
    this.#apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl);
    this.#entry =
      options.entry ??
      new AsyncEntry(KEYCHAIN_SERVICE, this.#apiBaseUrl);
  }

  public async load(): Promise<StoredAuthSession | undefined> {
    const serialized = await this.#entry.getPassword();
    if (!serialized) {
      return undefined;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      await this.clear();
      return undefined;
    }

    if (!isStoredAuthSession(parsed, this.#apiBaseUrl)) {
      await this.clear();
      return undefined;
    }

    return parsed;
  }

  public async save(session: StoredAuthSession): Promise<void> {
    if (!isStoredAuthSession(session, this.#apiBaseUrl)) {
      throw new Error("拒绝保存无效的 Coolto 登录 Session");
    }
    await this.#entry.setPassword(JSON.stringify(session));
  }

  public async clear(): Promise<void> {
    await this.#entry.deleteCredential();
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isStoredAuthSession(
  value: unknown,
  expectedBaseUrl: string,
): value is StoredAuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredAuthSession>;
  return (
    candidate.version === SESSION_VERSION &&
    candidate.apiBaseUrl === expectedBaseUrl &&
    typeof candidate.accessToken === "string" &&
    isSafeAccessToken(candidate.accessToken)
  );
}

function isSafeAccessToken(value: string): boolean {
  return value.length > 0 && /^[A-Za-z0-9._~-]+$/.test(value);
}

import { readFile, writeFile, rm } from "node:fs/promises";

import type {
  AuthSessionStore,
  StoredAuthSession,
} from "./session-store.js";

const SESSION_VERSION = 1;

/**
 * Session store backed by a JSON file (CLI --session-file). Lets the CLI run
 * on hosts where the OS keychain is not reachable from the electron main
 * process (macOS Keychain ACL denies unsigned Electron apps); the session can
 * be exported once from a node process that has access, then reused for
 * non-interactive runs. The file is a secret: callers must place it under a
 * restricted path and delete it after use.
 */
export class FileSessionStore implements AuthSessionStore {
  readonly #path: string;

  public constructor(path: string) {
    if (!path) throw new Error("--session-file 必须提供文件路径");
    this.#path = path;
  }

  public async load(): Promise<StoredAuthSession | undefined> {
    let serialized: string;
    try {
      serialized = await readFile(this.#path, "utf8");
    } catch {
      return undefined;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      return undefined;
    }
    if (!isStoredAuthSession(parsed)) {
      return undefined;
    }
    return parsed;
  }

  public async save(session: StoredAuthSession): Promise<void> {
    if (!isStoredAuthSession(session)) {
      throw new Error("拒绝保存无效的 Coolto 登录 Session");
    }
    await writeFile(this.#path, JSON.stringify(session, null, 2), {
      mode: 0o600,
    });
  }

  public async clear(): Promise<void> {
    await rm(this.#path, { force: true }).catch(() => undefined);
  }
}

function isStoredAuthSession(
  value: unknown,
): value is StoredAuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<StoredAuthSession>;
  return (
    candidate.version === SESSION_VERSION &&
    typeof candidate.apiBaseUrl === "string" &&
    typeof candidate.accessToken === "string" &&
    candidate.accessToken.length > 0
  );
}
